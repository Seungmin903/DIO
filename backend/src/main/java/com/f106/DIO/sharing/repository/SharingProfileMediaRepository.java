package com.f106.DIO.sharing.repository;
import com.f106.DIO.sharing.domain.SharingProfileMedia;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
public interface SharingProfileMediaRepository extends JpaRepository<SharingProfileMedia,UUID> {}
