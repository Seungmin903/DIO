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
        var afterNode=codec.object();afterNode.set("elements",codec.tree(after));afterNode.set("expected",codec.tree(after));afterNode.put("revision",0);
        history.invalidateRedo(ticket.page(),ticket.actor());
        var row=history.saveAndFlush(new CanvasHistoryOperation(ticket.page(),ticket.actor(),ticket.client(),ticket.type(),beforeNode.toString(),afterNode.toString()));
        events.publishEvent(new CanvasCommitted(ticket.diary(),ticket.page(),row.getOperationId().toString(),ticket.client(),ticket.actor(),0,"APPLY"));return row;
    }
}
