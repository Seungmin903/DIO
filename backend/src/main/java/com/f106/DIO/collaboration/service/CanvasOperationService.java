package com.f106.DIO.collaboration.service;
import com.f106.DIO.collaboration.domain.*;
import com.f106.DIO.collaboration.dto.*;
import com.f106.DIO.collaboration.exception.CollaborationException;
import com.f106.DIO.collaboration.repository.*;
import com.f106.DIO.page.service.CanvasElementService;
import com.f106.DIO.page.dto.CanvasElementBatchRequest;
import com.f106.DIO.page.dto.CanvasElementCreateRequest;
import com.f106.DIO.page.dto.CanvasElementUpdateRequest;
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
        // Two clients can create the same deterministic tasting-mark ID before either
        // has observed the other's element. Page locking makes this check and conversion
        // atomic; preserve a member's own history by tracking the second fill as update.
        canvas.batchTracked(page,coalesceConcurrentTastingMarks(page,request.changes()),actor,request.clientOperationId(),hash);
        var row=history.findFirstByPageIdAndActorUserIdAndClientOperationId(page,actor,request.clientOperationId()).orElseThrow();
        return response(row,page,actor,false);
    }
    private CanvasElementBatchRequest coalesceConcurrentTastingMarks(UUID page,CanvasElementBatchRequest changes){
        if(changes==null||changes.creates()==null||changes.creates().isEmpty())return changes;
        var existing=snapshots.capture(page,changes.creates().stream().map(CanvasElementCreateRequest::getElementId).filter(Objects::nonNull).toList());
        var creates=new ArrayList<CanvasElementCreateRequest>();var updates=new ArrayList<CanvasElementUpdateRequest>();
        if(changes.updates()!=null)updates.addAll(changes.updates());
        for(var create:changes.creates()){
            var current=create.getElementId()==null?null:existing.get(create.getElementId().toString());
            if(current==null||current.deletedAt()!=null||!sameTastingMark(current,create)){creates.add(create);continue;}
            var update=new CanvasElementUpdateRequest();update.setElementId(current.elementId());update.setVersion(current.version());update.setPropertiesJson(create.getPropertiesJson());updates.add(update);
        }
        return new CanvasElementBatchRequest(creates.isEmpty()?null:creates,updates.isEmpty()?null:updates,changes.deleteElementIds(),changes.restoreElementIds());
    }
    private boolean sameTastingMark(com.f106.DIO.collaboration.domain.CanvasElementSnapshot current,CanvasElementCreateRequest create){
        if(!"SHAPE".equals(create.getElementType())||!"SHAPE".equals(current.elementType())||!Boolean.TRUE.equals(create.getIsLocked())||!Boolean.TRUE.equals(create.getIsHidden())||!current.isLocked()||!current.isHidden())return false;
        // sortKey is ordering metadata and can differ between offline snapshots.
        // A tasting mark update changes only propertiesJson, so retain the server's
        // current order while still merging the same hidden mark.
        if(!Objects.equals(current.groupId(),create.getGroupId())||!Objects.equals(current.name(),create.getName())||!Objects.equals(current.mediaFileId(),create.getMediaFileId()))return false;
        if(!same(current.x(),create.getX())||!same(current.y(),create.getY())||!same(current.width(),create.getWidth())||!same(current.height(),create.getHeight())||!same(current.rotation(),create.getRotation()==null?java.math.BigDecimal.ZERO:create.getRotation())||!same(current.opacity(),create.getOpacity()==null?java.math.BigDecimal.ONE:create.getOpacity()))return false;
        var old=current.propertiesJson();var next=create.getPropertiesJson();if(old==null||next==null||!old.isObject()||!next.isObject())return false;
        var oldMark=old.get("tastingMark");var nextMark=next.get("tastingMark");if(oldMark==null||!oldMark.isTextual()||!oldMark.equals(nextMark))return false;
        var oldComparable=old.deepCopy();var nextComparable=next.deepCopy();((tools.jackson.databind.node.ObjectNode)oldComparable).remove("fill");((tools.jackson.databind.node.ObjectNode)nextComparable).remove("fill");return oldComparable.equals(nextComparable);
    }
    private boolean same(java.math.BigDecimal a,java.math.BigDecimal b){return a==null?b==null:b!=null&&a.compareTo(b)==0;}
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
