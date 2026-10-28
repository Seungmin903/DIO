package com.f106.DIO.sharing.service;
import com.f106.DIO.sharing.exception.SharingException;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
@Service
public class DiaryOwnershipService {
    private final SharingAccessService access;
    public DiaryOwnershipService(SharingAccessService access){this.access=access;}
    @Transactional
    public void transfer(UUID diary,long actor,long successor){
        var book=access.lock(diary);access.owner(book,actor);
        if(actor==successor)throw SharingException.invalid("다른 멤버를 후임으로 선택해 주세요.");
        var next=access.member(book,successor);var previous=access.member(book,actor);
        next.promote();previous.demote();book.transferOwnership(successor);
    }
}
