package com.f106.DIO.inventory;

import jakarta.persistence.*;

/** Persistent transaction mutex, independent of user/account row locks. */
@Entity @Table(name="inventory_quota_locks")
public class InventoryGuard {
 @Id @Column(name="user_id") private Long userId;
 protected InventoryGuard() {}
}
