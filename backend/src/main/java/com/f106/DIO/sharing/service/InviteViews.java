package com.f106.DIO.sharing.service;
import com.f106.DIO.sharing.domain.DiaryInvite;
import com.f106.DIO.sharing.dto.*;
import com.f106.DIO.sharing.support.InviteTokens;
import com.f106.DIO.diary.repository.DiaryRepository;
import com.f106.DIO.user.repository.UserRepository;
import com.f106.DIO.user.domain.User;
import java.util.*;
import java.util.stream.Collectors;
import org.springframework.data.domain.Page;
import org.springframework.stereotype.Component;
@Component
public class InviteViews {
    private final DiaryRepository diaries;private final UserRepository users;private final InviteTokens tokens;
    public InviteViews(DiaryRepository diaries,UserRepository users,InviteTokens tokens){this.diaries=diaries;this.users=users;this.tokens=tokens;}
    public EmailInvitePageResponse page(Page<DiaryInvite> source) {
        var ids=new HashSet<Long>();source.forEach(i->{ids.add(i.getInviterUserId());ids.add(i.getInviteeUserId());});
        var accounts=users.findAllById(ids).stream().collect(Collectors.toMap(User::getUserId,u->u));
        var books=diaries.findAllById(source.stream().map(DiaryInvite::getDiaryId).collect(Collectors.toSet())).stream()
            .collect(Collectors.toMap(d->d.getDiaryId(),d->d));
        var items=source.stream().map(i->{
            var from=accounts.get(i.getInviterUserId());var to=accounts.get(i.getInviteeUserId());var book=books.get(i.getDiaryId());
            String token=null;
            if(i.pendingEmail()&&book!=null&&book.getDeletedAt()==null&&to!=null&&to.isActive()){
                String candidate=tokens.token(i);if(tokens.matches(i,candidate))token=candidate;
            }
            return new EmailInviteResponse(i.getInviteId().toString(),i.getDiaryId(),book==null?null:book.getTitle(),
                i.getInviterUserId().toString(),name(from),i.getInviteeUserId().toString(),name(to),
                to!=null&&to.isActive()?to.getEmail():null,i.status(),i.getCreatedAt(),i.publicExpiresAt(),token,token==null?null:tokens.url(token));
        }).toList();
        return new EmailInvitePageResponse(items,source.getNumber(),source.getSize(),source.hasNext(),source.getTotalElements());
    }
    private String name(User user){return user!=null&&user.isActive()?user.getNickname():"탈퇴한 사용자";}
}
