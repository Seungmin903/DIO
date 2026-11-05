package com.f106.DIO.moderation.repository;
import com.f106.DIO.moderation.domain.*;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.domain.*;
import java.util.*;
public interface UserBlockRepository extends JpaRepository<UserBlock,UserBlockId> {
 boolean existsByBlockerUserIdAndBlockedUserId(Long actor,Long target);
 Slice<UserBlock> findByBlockerUserId(Long actor,Pageable page);
 @Query("select b.blockedUserId from UserBlock b where b.blockerUserId=:actor") List<Long> targets(Long actor);
}
