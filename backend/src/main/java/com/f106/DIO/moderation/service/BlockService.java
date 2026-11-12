package com.f106.DIO.moderation.service;
import com.f106.DIO.moderation.domain.*;
import com.f106.DIO.moderation.repository.UserBlockRepository;
import com.f106.DIO.moderation.exception.ModerationException;
import com.f106.DIO.sharing.service.SharingAccessService;
import com.f106.DIO.user.repository.UserRepository;
import java.time.Instant;import java.util.*;
import org.springframework.stereotype.Service;import org.springframework.transaction.annotation.Transactional;
import org.springframework.jdbc.core.JdbcTemplate;import org.springframework.data.domain.*;
@Service
public class BlockService {
 private final UserBlockRepository blocks;private final SharingAccessService access;private final UserRepository users;private final JdbcTemplate jdbc;
 public BlockService(UserBlockRepository blocks,SharingAccessService access,UserRepository users,JdbcTemplate jdbc){this.blocks=blocks;this.access=access;this.users=users;this.jdbc=jdbc;}
 // All pair mutations/check-and-write operations take user rows in a stable order, before any diary lock; inventory quota guards are acquired last.
 public void lockPair(long actor,long target){
  jdbc.queryForList("select user_id from users where user_id in (?,?) order by user_id for update",Math.min(actor,target),Math.max(actor,target));
 }
 public boolean between(long a,long b){return blocks.existsByBlockerUserIdAndBlockedUserId(a,b)||blocks.existsByBlockerUserIdAndBlockedUserId(b,a);}
 public Set<Long> targets(long actor){return new HashSet<>(blocks.targets(actor));}
 @Transactional public void block(long actor,long target,UUID diaryId){
  if(actor==target)throw ModerationException.invalid("본인은 차단할 수 없어요.");
  if(blocks.existsById(new UserBlockId(actor,target)))return;
  lockPair(actor,target);
  var diary=access.lock(diaryId);access.readMember(diary,actor);
  if(access.visibleMembers(diary).stream().noneMatch(m->m.getUserId()==target))throw ModerationException.missing();
  if(!blocks.existsById(new UserBlockId(actor,target)))blocks.saveAndFlush(new UserBlock(actor,target));
 }
 @Transactional public void unblock(long actor,long target){access.activeUser(actor);lockPair(actor,target);blocks.findById(new UserBlockId(actor,target)).ifPresent(blocks::delete);}
 public record Item(long userId,String nickname,Instant blockedAt){}
 public record Result(List<Item> items,int page,int size,boolean hasNext){}
 @Transactional(readOnly=true) public Result list(long actor,int page,int size){
  access.activeUser(actor);if(page<0||size<1||size>100)throw ModerationException.invalid("page는 0 이상, size는 1~100으로 입력해 주세요.");
  var result=blocks.findByBlockerUserId(actor,PageRequest.of(page,size,Sort.by(Sort.Order.desc("createdAt"),Sort.Order.asc("blockedUserId"))));
  var ids=result.getContent().stream().map(UserBlock::getBlockedUserId).toList();
  var names=new HashMap<Long,String>();users.findAllById(ids).forEach(u->names.put(u.getUserId(),u.isActive()?u.getNickname():"탈퇴한 사용자"));
  return new Result(result.stream().map(b->new Item(b.getBlockedUserId(),names.getOrDefault(b.getBlockedUserId(),"탈퇴한 사용자"),b.getCreatedAt())).toList(),page,size,result.hasNext());
 }
}
