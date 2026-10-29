package com.f106.DIO.collaboration;
import com.f106.DIO.page.service.*;
import com.f106.DIO.page.repository.CanvasElementRepository;
import com.f106.DIO.page.dto.*;
import com.f106.DIO.diary.support.DiaryAccessDeniedException;
import com.f106.DIO.collaboration.service.CanvasChangeJournal;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
class CanvasBatchAccessOrderTests {
    @Test void deniedRequestDoesNotGenerateIdsOrInspectBatchContents(){
        var pages=mock(PageService.class);var elements=mock(CanvasElementRepository.class);var journal=mock(CanvasChangeJournal.class);
        var service=new CanvasElementService(pages,elements,journal);UUID page=UUID.randomUUID(),duplicate=UUID.randomUUID();
        var create=new CanvasElementCreateRequest();var request=new CanvasElementBatchRequest(List.of(create),null,List.of(duplicate,duplicate),null);
        when(pages.requireWritablePage(page,7L)).thenThrow(new DiaryAccessDeniedException());
        assertThatThrownBy(()->service.batchTracked(page,request,7L,UUID.randomUUID(),null)).isInstanceOf(DiaryAccessDeniedException.class);
        assertThat(create.getElementId()).isNull();verifyNoInteractions(elements,journal);
    }
    @Test void writePermissionIsCheckedAgainAfterAggregateLock(){
        var pages=mock(PageService.class);var elements=mock(CanvasElementRepository.class);var journal=mock(CanvasChangeJournal.class);
        var service=new CanvasElementService(pages,elements,journal);UUID page=UUID.randomUUID(),client=UUID.randomUUID(),element=UUID.randomUUID();
        when(pages.requireWritablePage(page,7L)).thenReturn(null).thenThrow(new DiaryAccessDeniedException());
        var request=new CanvasElementBatchRequest(null,null,List.of(element),null);
        assertThatThrownBy(()->service.batchTracked(page,request,7L,client,null)).isInstanceOf(DiaryAccessDeniedException.class);
        var order=inOrder(pages,journal);order.verify(pages).requireWritablePage(page,7L);order.verify(journal).begin(eq(page),eq(7L),anyCollection(),eq(client),isNull(),eq("BATCH"));order.verify(pages).requireWritablePage(page,7L);
        verifyNoInteractions(elements);
    }
}
