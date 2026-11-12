package com.f106.DIO.diary.creation;
import org.springframework.stereotype.Component;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.transaction.annotation.Transactional;
@Component
@org.springframework.boot.autoconfigure.condition.ConditionalOnProperty(name="dio.diary.receipt-cleanup.enabled",havingValue="true",matchIfMissing=true)
@EnableScheduling
public class DiaryReceiptCleanup {
    private final DiaryCreationReceiptRepository receipts;
    public DiaryReceiptCleanup(DiaryCreationReceiptRepository receipts) {this.receipts=receipts;}
    @Scheduled(fixedDelay=60000,initialDelay=60000)
    @Transactional
    public void clearExpiredResponses() {receipts.clearExpiredResponses();}
}
