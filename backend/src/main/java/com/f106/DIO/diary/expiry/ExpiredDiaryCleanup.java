package com.f106.DIO.diary.expiry;

import java.sql.Timestamp;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import com.f106.DIO.diary.detail.DiaryDetailRepository;
import com.f106.DIO.diary.purge.DiaryPurgeGraph;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.*;
import org.springframework.jdbc.core.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.*;
import org.springframework.transaction.support.TransactionTemplate;

/** 내부 배치 전용. HTTP 사용자/OWNER를 가장하지 않고 잠금 후 만료된 회원 다이어리만 정리한다. */
@Service
@ConditionalOnProperty(name="dio.diary.expiry-cleanup.enabled",havingValue="true")
public class ExpiredDiaryCleanup {
    private final JdbcTemplate jdbc;
    private final DiaryDetailRepository diaries;
    private final DiaryPurgeGraph graph;
    private final TransactionTemplate transaction;
    private final Clock clock;
    private final Duration retention;
    private final int batchSize,lockTimeoutMs;
    private final boolean postgres;
    private Candidate cursor;
    public record Candidate(UUID id,Instant deletedAt) {}
    public record Result(int examined,int deleted,int skipped,int failed) {}

    @Autowired
    public ExpiredDiaryCleanup(JdbcTemplate jdbc,DiaryDetailRepository diaries,PlatformTransactionManager manager,
            ObjectProvider<Clock> clocks,@Value("${dio.diary.trash.retention-days:30}") int days,
            @Value("${dio.diary.expiry-cleanup.batch-size:20}") int batchSize,
            @Value("${dio.diary.expiry-cleanup.lock-timeout-ms:1000}") int lockTimeoutMs) {
        this(jdbc,diaries,manager,clocks.getIfAvailable(Clock::systemUTC),days,batchSize,lockTimeoutMs);
    }
    public ExpiredDiaryCleanup(JdbcTemplate jdbc,DiaryDetailRepository diaries,PlatformTransactionManager manager,
            Clock clock,int days,int batchSize,int lockTimeoutMs) {
        if(days<1 || days>36500 || batchSize<1 || batchSize>500 || lockTimeoutMs<1 || lockTimeoutMs>5000)
            throw new IllegalArgumentException("Invalid diary cleanup configuration");
        this.jdbc=jdbc;this.diaries=diaries;this.graph=new DiaryPurgeGraph(jdbc);this.clock=clock;
        this.retention=Duration.ofDays(days);this.batchSize=batchSize;this.lockTimeoutMs=lockTimeoutMs;
        this.transaction=new TransactionTemplate(manager);
        transaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        transaction.setTimeout(15);
        postgres=Boolean.TRUE.equals(jdbc.execute((ConnectionCallback<Boolean>)c->"PostgreSQL".equals(c.getMetaData().getDatabaseProductName())));
    }
    public synchronized Result run() {
        Instant cutoff=clock.instant().truncatedTo(ChronoUnit.MICROS).minus(retention);
        var candidates=find(cutoff,cursor);
        if(candidates.isEmpty() && cursor!=null) {cursor=null;candidates=find(cutoff,null);}
        int deleted=0,skipped=0,failed=0;
        for(var candidate:candidates) {
            try {
                if(Boolean.TRUE.equals(transaction.execute(s->deleteIfExpired(candidate.id(),cutoff)))) deleted++;
                else skipped++;
            } catch(RuntimeException error) {
                failed++;
                LoggerFactory.getLogger(getClass()).warn("Expired diary item deferred: errorType={}",error.getClass().getSimpleName());
            }
        }
        // 실패 항목을 포함해 선택한 마지막 키 다음부터 이어가 오래된 오류 항목이 뒤 자료를 굶기지 않게 한다.
        cursor=candidates.size()==batchSize?candidates.get(candidates.size()-1):null;
        return new Result(candidates.size(),deleted,skipped,failed);
    }
    private List<Candidate> find(Instant cutoff,Candidate after) {
        String sql="SELECT diary_id,deleted_at FROM diaries WHERE owner_user_id IS NOT NULL AND deleted_at IS NOT NULL AND deleted_at<=?";
        var args=new ArrayList<Object>();args.add(Timestamp.from(cutoff));
        if(after!=null) {sql+=" AND (deleted_at>? OR (deleted_at=? AND diary_id>?))";args.add(Timestamp.from(after.deletedAt()));args.add(Timestamp.from(after.deletedAt()));args.add(after.id());}
        sql+=" ORDER BY deleted_at,diary_id LIMIT ?";args.add(batchSize);
        return jdbc.query(sql,(rs,n)->new Candidate(rs.getObject("diary_id",UUID.class),rs.getTimestamp("deleted_at").toInstant()),args.toArray());
    }
    private boolean deleteIfExpired(UUID id,Instant cutoff) {
        if(postgres) jdbc.queryForObject("SELECT set_config('lock_timeout',?,true)",String.class,lockTimeoutMs+"ms");
        graph.lockReceipts(id);
        var row=diaries.lock(id,true);
        if(row.isEmpty() || row.get().ownerUserId()==null || row.get().deletedAt()==null || row.get().deletedAt().isAfter(cutoff)) return false;
        graph.deleteLocked(id);
        return true;
    }
}
