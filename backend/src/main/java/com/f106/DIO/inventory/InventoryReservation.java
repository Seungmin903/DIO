package com.f106.DIO.inventory;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity @Table(name="inventory_media_reservations")
public class InventoryReservation {
 @Id @Column(name="reservation_id") private UUID id;
 @Column(name="user_id",nullable=false) private Long userId;
 @Column(nullable=false,length=20) private String kind;
 @Column(name="expires_at",nullable=false) private Instant expiresAt;
 protected InventoryReservation() {}
}
