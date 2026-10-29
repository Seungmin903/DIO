package com.f106.DIO.collaboration.service;
import com.f106.DIO.collaboration.domain.*;
import com.f106.DIO.collaboration.dto.*;
import com.f106.DIO.collaboration.exception.CollaborationException;
import com.f106.DIO.collaboration.repository.*;
import com.f106.DIO.page.service.CanvasElementService;
import java.util.*;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
@Service
public class CanvasOperationService {
    private final CollaborationAccess access;private final CanvasElementService canvas;private final CanvasHistoryRepository history;
    private final CanvasSnapshotRepository snapshots;private final CanvasHistoryCodec codec;private final ApplicationEventPublisher events;
    public CanvasOperationService(CollaborationAccess access,CanvasElementService canvas,CanvasHistoryRepository history,CanvasSnapshotRepository snapshots,CanvasHistoryCodec codec,ApplicationEventPublisher events){
        this.access=access;this.canvas=canvas;this.history=history;this.snapshots=snapshots;this.codec=codec;this.events=events;
    }
    @Transactional public CanvasOperationResponse apply(UUID page,long actor,CanvasOperationRequest request){
        access.lockPage(page,actor);String hash=codec.hash(request);
        var previous=history.findFirstByPageIdAndActorUserIdAndClientOperationId(page,actor,request.clientOperationId()).orElse(null);
        if(previous!=null){if(!"COLLAB_ELEMENTS_V1".equals(previous.getSnapshotFormat()))throw CollaborationException.conflict();if(!hash.equals(codec.read(previous.getBeforeStateJson()).path("requestHash").asText()))throw CollaborationException.conflict();return response(previous,page,actor,true);}
        var versions=request.expectedVersions()==null?Map.<UUID,Long>of():request.expectedVersions();
        if(!versions.isEmpty()){
            var current=snapshots.capture(page,versions.keySet());
            for(var e:versions.entrySet()){var state=current.get(e.getKey().toString());if(state==null||state.version()!=e.getValue())throw CollaborationException.conflict();}
        }
        canvas.batchTracked(page,request.changes(),actor,request.clientOperationId(),hash);
        var row=history.findFirstByPageIdAndActorUserIdAndClientOperationId(page,actor,request.clientOperationId()).orElseThrow();
        return response(row,page,actor,false);
    }
    @Transactional public CanvasOperationResponse transition(UUID page,long actor,CanvasHistoryCommand request,boolean undo){
        UUID diary=access.lockPage(page,actor);
        var row=history.findByOperationIdAndPageIdAndActorUserId(request.operationId(),page,actor).orElseThrow(CollaborationException::missing);
        if(!"COLLAB_ELEMENTS_V1".equals(row.getSnapshotFormat()))throw CollaborationException.conflict();
        var after=codec.read(row.getAfterStateJson());String hash=codec.hash(List.of(undo?"UNDO":"REDO",request));
        if(request.clientOperationId().toString().equals(after.path("lastCommandId").asText())){
            if(!hash.equals(after.path("lastCommandHash").asText()))throw CollaborationException.conflict();return response(row,page,actor,true);
        }
        var latest=undo?history.findFirstByPageIdAndActorUserIdAndStatusOrderByOperationIdDesc(page,actor,"APPLIED")
            :history.findFirstByPageIdAndActorUserIdAndStatusOrderByUndoneAtDescOperationIdAsc(page,actor,"UNDONE");
        if(latest.isEmpty()||!latest.get().getOperationId().equals(row.getOperationId())||after.path("revision").asInt()!=request.expectedRevision())throw CollaborationException.conflict();
        var expected=codec.states(after.has("expected")?after.path("expected"):after.path("elements"));var ids=expected.keySet().stream().map(UUID::fromString).toList();
        var current=snapshots.capture(page,ids);
        for(var e:expected.entrySet())if(!codec.same(e.getValue(),current.get(e.getKey())))throw CollaborationException.conflict();
        var desired=codec.states((undo?codec.read(row.getBeforeStateJson()):after).path("elements"));
        snapshots.restore(page,desired,current);
        after.set("expected",codec.tree(snapshots.capture(page,ids)));int revision=request.expectedRevision()+1;
        after.put("revision",revision);after.put("lastCommandId",request.clientOperationId().toString());after.put("lastCommandHash",hash);
        row.transition(undo,after.toString());history.flush();
        events.publishEvent(new CanvasCommitted(diary,page,row.getOperationId().toString(),request.clientOperationId(),actor,revision,undo?"UNDO":"REDO"));
        return response(row,page,actor,false);
    }
    @Transactional(readOnly=true) public CanvasHistoryPage history(UUID page,long actor,int index,int size){
        access.readPage(page,actor);if(index<0||size<1||size>100)throw CollaborationException.invalid("page는 0 이상, size는 1~100이어야 해요.");
        var rows=history.findByPageIdAndActorUserId(page,actor,PageRequest.of(index,size,Sort.by(Sort.Direction.DESC,"operationId")));
        var undo=history.findFirstByPageIdAndActorUserIdAndStatusOrderByOperationIdDesc(page,actor,"APPLIED");
        var redo=history.findFirstByPageIdAndActorUserIdAndStatusOrderByUndoneAtDescOperationIdAsc(page,actor,"UNDONE");
        return new CanvasHistoryPage(rows.map(this::item).getContent(),index,size,rows.hasNext(),undo.filter(r->"COLLAB_ELEMENTS_V1".equals(r.getSnapshotFormat())).map(this::item).orElse(null),redo.filter(r->"COLLAB_ELEMENTS_V1".equals(r.getSnapshotFormat())).map(this::item).orElse(null));
    }
    private CanvasHistoryItem item(CanvasHistoryOperation row){return new CanvasHistoryItem(row.getOperationId().toString(),row.getClientOperationId().toString(),row.getOperationType(),row.getStatus(),("COLLAB_ELEMENTS_V1".equals(row.getSnapshotFormat())?codec.revision(row.getAfterStateJson()):0),row.getCreatedAt(),row.getUndoneAt());}
    private CanvasOperationResponse response(CanvasHistoryOperation row,UUID page,long actor,boolean replayed){return new CanvasOperationResponse(row.getOperationId().toString(),row.getClientOperationId().toString(),row.getStatus(),codec.revision(row.getAfterStateJson()),replayed,canvas.list(page,actor).items());}
}
