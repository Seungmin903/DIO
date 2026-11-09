package com.f106.DIO.diary.creation;

import java.util.List;
import java.util.UUID;
import com.f106.DIO.diary.dto.DiaryCreateRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.json.JsonMapper;

@Service
public class IdempotentDiaryCreationService {
    private final DiaryCreationIdentity identity;
    private final MemberDiaryCreationRepository users;
    private final DiaryCreationReceiptRepository receipts;
    private final MemberDiaryCreationService creation;
    private final JsonMapper json=JsonMapper.builder().build();
    public IdempotentDiaryCreationService(DiaryCreationIdentity identity,MemberDiaryCreationRepository users,
            DiaryCreationReceiptRepository receipts,MemberDiaryCreationService creation) {
        this.identity=identity; this.users=users; this.receipts=receipts; this.creation=creation;
    }
    @Transactional
    public Result create(String key,DiaryCreateRequest metadata,List<DiaryInitialPages.Selection> pages) {
        return create(key,metadata,pages,null);
    }
    @Transactional
    public Result create(String key,DiaryCreateRequest metadata,List<DiaryInitialPages.Selection> pages,tools.jackson.databind.JsonNode paperAppearance) {
        if(!TransactionSynchronizationManager.isActualTransactionActive()) throw new IllegalStateException("Idempotent creation requires a transaction");
        long user=identity.requireUserId();
        if(user<=0 || users.lockActiveUserColor(user).isEmpty()) throw DiaryCreationException.unauthorized();
        String keyHash=DiaryCreationFingerprint.key(key), requestHash=DiaryCreationFingerprint.request(metadata,pages,paperAppearance);
        var claim=receipts.claim(user,keyHash,requestHash);
        boolean fresh=claim.fresh();
        var receipt=claim.receipt();
        if(!receipt.requestHash().equals(requestHash)) throw DiaryIdempotencyException.conflict();
        if(!fresh) {
            if(receipt.completedAt()!=null && !java.time.Instant.now().isBefore(receipt.completedAt().plus(java.time.Duration.ofHours(24)))) throw DiaryIdempotencyException.expired();
            if(!receipts.accessible(user,receipt.diaryId())) throw DiaryIdempotencyException.unavailable();
            if(receipt.body()==null) throw DiaryIdempotencyException.pending();
            try {
                var result=json.readValue(receipt.body(),MemberDiaryCreationService.Created.class);
                if(!UUID.fromString(result.diary().diaryId()).equals(receipt.diaryId()) || result.pageIds().isEmpty()
                    || !result.pageIds().get(0).equals(result.firstPageId())) throw DiaryCreationException.invalidState();
                return new Result(result,true);
            } catch(JacksonException | IllegalArgumentException invalid) { throw DiaryCreationException.invalidState(); }
        }
        var result=creation.create(metadata,pages);
        if(paperAppearance!=null)users.setInitialPaperAppearance(UUID.fromString(result.diary().diaryId()),paperAppearance.toString());
        receipts.complete(user,keyHash,UUID.fromString(result.diary().diaryId()),json.writeValueAsString(result));
        return new Result(result,false);
    }
    public record Result(MemberDiaryCreationService.Created created,boolean replayed) {}
}
