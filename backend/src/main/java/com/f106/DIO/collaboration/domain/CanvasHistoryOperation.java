package com.f106.DIO.collaboration.domain;
import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.Instant;
import java.util.UUID;
@Entity @Table(name="canvas_history_operations") @lombok.Getter
public class CanvasHistoryOperation {
    @Id @GeneratedValue(strategy=GenerationType.IDENTITY) private Long operationId;
    @Column(nullable=false) private UUID pageId;
    @Column(nullable=false) private Long actorUserId;
    @Column(nullable=false) private UUID clientOperationId;
    @Column(nullable=false,length=20) private String operationType;
    @Column(nullable=false,length=30) private String snapshotFormat;
    @JdbcTypeCode(SqlTypes.JSON) @Column(nullable=false,columnDefinition="jsonb") private String beforeStateJson;
    @JdbcTypeCode(SqlTypes.JSON) @Column(nullable=false,columnDefinition="jsonb") private String afterStateJson;
    @Column(nullable=false,length=20) private String status;
    private Instant undoneAt;
    @Column(nullable=false) private Instant createdAt;
    protected CanvasHistoryOperation(){}
    public CanvasHistoryOperation(UUID page,long actor,UUID client,String type,String before,String after){
        pageId=page;actorUserId=actor;clientOperationId=client;operationType=type;snapshotFormat="COLLAB_ELEMENTS_V1";
        beforeStateJson=before;afterStateJson=after;status="APPLIED";createdAt=Instant.now();
    }
    public void transition(boolean undo,String after){status=undo?"UNDONE":"APPLIED";undoneAt=undo?Instant.now():null;afterStateJson=after;}
}
