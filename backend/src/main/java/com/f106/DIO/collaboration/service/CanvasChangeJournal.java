package com.f106.DIO.collaboration.service;
import com.f106.DIO.collaboration.domain.*;
import com.f106.DIO.collaboration.repository.*;
import java.util.*;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
@Service
public class CanvasChangeJournal {
    public record Ticket(UUID page,UUID diary,long actor,UUID client,String requestHash,String type,Map<String,CanvasElementSnapshot> before){}
    private final CollaborationAccess access;private final CanvasSnapshotRepository snapshots;private final CanvasHistoryRepository history;
    private final CanvasHistoryCodec codec;private final ApplicationEventPublisher events;
    public CanvasChangeJournal(CollaborationAccess access,CanvasSnapshotRepository snapshots,CanvasHistoryRepository history,CanvasHistoryCodec codec,ApplicationEventPublisher events){
        this.access=access;this.snapshots=snapshots;this.history=history;this.codec=codec;this.events=events;
    }
    public Ticket begin(UUID page,long actor,Collection<UUID> ids,UUID client,String hash,String type){
        UUID diary=access.lockPage(page,actor);return new Ticket(page,diary,actor,client,hash,type,snapshots.capture(page,ids));
    }
    public CanvasHistoryOperation complete(Ticket ticket){
        var ids=ticket.before().keySet().stream().map(UUID::fromString).toList();
        var after=snapshots.capture(ticket.page(),ids);var beforeNode=codec.object();
        beforeNode.set("elements",codec.tree(ticket.before()));if(ticket.requestHash()!=null)beforeNode.put("requestHash",ticket.requestHash());
        var afterNode=codec.object();afterNode.set("elements",codec.tree(after));afterNode.put("revision",0);
        history.invalidateRedo(ticket.page(),ticket.actor());
        var row=history.saveAndFlush(new CanvasHistoryOperation(ticket.page(),ticket.actor(),ticket.client(),ticket.type(),beforeNode.toString(),afterNode.toString()));
        prune(ticket.page(),ticket.actor());
        events.publishEvent(new CanvasCommitted(ticket.diary(),ticket.page(),row.getOperationId().toString(),ticket.client(),ticket.actor(),0,"APPLY"));return row;
    }
    private void prune(UUID page,long actor){
        // Match the editor's 80-step history. Preserve command identities so old retries
        // are rejected rather than replayed as new mutations after snapshots expire.
        var older=history.findByPageIdAndActorUserIdAndSnapshotFormat(page,actor,"COLLAB_ELEMENTS_V1",
            org.springframework.data.domain.PageRequest.of(1,80,org.springframework.data.domain.Sort.by(org.springframework.data.domain.Sort.Direction.DESC,"operationId")));
        for(var row:older){
            var before=codec.read(row.getBeforeStateJson());before.remove("elements");
            var after=codec.read(row.getAfterStateJson());after.remove("elements");after.remove("expected");
            row.expireSnapshots(before.toString(),after.toString());
        }
        if(!older.isEmpty())history.flush();
    }
}
