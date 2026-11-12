package com.f106.DIO.moderation.service;

import com.f106.DIO.moderation.exception.ModerationException;
import com.f106.DIO.moderation.repository.UserReportRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

@Component
public class ReportSubmissionLimits {
    private static final int MAX_ACTORS=20_000;
    private final UserReportRepository reports;
    private final LinkedHashMap<Long,Attempts> attempts=new LinkedHashMap<>(128,0.75f,true);
    private Instant nextSweep=Instant.MIN;
    private static final class Attempts {
        Instant hourEnd,dayEnd;
        int hour,day;
        Attempts(Instant now){hourEnd=now.plusSeconds(3600);dayEnd=now.plusSeconds(86400);}
    }
    public ReportSubmissionLimits(UserReportRepository reports){this.reports=reports;}

    /** Processing budget, including invalid and replayed requests, before image decoding. */
    public synchronized void reserveAttempt(long actor,Instant now){
        if(!now.isBefore(nextSweep)){
            attempts.values().removeIf(a->!a.dayEnd.isAfter(now));
            nextSweep=now.plusSeconds(60);
        }
        var window=attempts.get(actor);
        if(window==null){
            // Best-effort attempt cache never globally rejects unrelated users. DB quotas remain authoritative.
            if(attempts.size()>=MAX_ACTORS){var oldest=attempts.keySet().iterator();oldest.next();oldest.remove();}
            window=new Attempts(now);attempts.put(actor,window);
        }
        if(!window.dayEnd.isAfter(now)){window.day=0;window.dayEnd=now.plusSeconds(86400);}
        if(!window.hourEnd.isAfter(now)){window.hour=0;window.hourEnd=now.plusSeconds(3600);}
        long retry=0;
        if(window.hour>=30)retry=seconds(now,window.hourEnd);
        if(window.day>=100)retry=Math.max(retry,seconds(now,window.dayEnd));
        if(retry>0)throw limited("REPORT_ATTEMPT_RATE_LIMITED","신고 요청이 많아요. 잠시 후 다시 시도해 주세요.",retry);
        window.hour++;window.day++;
    }

    /** Recheck under the reporter's row lock immediately before inserting a NEW report. */
    public void checkAccepted(long actor,long target,Instant now){
        long retry=0;
        retry=Math.max(retry,remaining(reports.recentByActor(actor,now.minusSeconds(3600),PageRequest.of(0,10)),10,3600,now));
        retry=Math.max(retry,remaining(reports.recentByActor(actor,now.minusSeconds(86400),PageRequest.of(0,30)),30,86400,now));
        retry=Math.max(retry,remaining(reports.recentByTarget(actor,target,now.minusSeconds(86400),PageRequest.of(0,3)),3,86400,now));
        if(retry>0)throw limited("REPORT_RATE_LIMITED","신고 접수 한도에 도달했어요. 잠시 후 다시 시도해 주세요.",retry);
    }
    private long remaining(List<Instant> rows,int limit,long window,Instant now){
        return rows.size()<limit?0:seconds(now,rows.get(limit-1).plusSeconds(window));
    }
    private long seconds(Instant now,Instant end){return Math.max(1,(Duration.between(now,end).toMillis()+999)/1000);}
    private ModerationException limited(String code,String message,long retry){
        return new ModerationException(HttpStatus.TOO_MANY_REQUESTS,code,message,retry);
    }
}
