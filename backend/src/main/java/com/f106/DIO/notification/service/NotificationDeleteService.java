package com.f106.DIO.notification.service;

import java.time.Clock;
import java.time.temporal.ChronoUnit;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.f106.DIO.notification.repository.NotificationRepository;
import com.f106.DIO.notification.support.NotificationException;

/** 삭제는 notifications만 사용하며 전체 읽음 경계/저장소와 독립적이다. */
@Service
@Transactional
public class NotificationDeleteService {
    private final NotificationRepository notifications;
    private final Clock clock;

    public NotificationDeleteService(NotificationRepository notifications, ObjectProvider<Clock> clocks) {
        this.notifications = notifications;
        this.clock = clocks.getIfAvailable(Clock::systemUTC);
    }

    public void delete(long userId, long id) {
        notifications.softDelete(userId, id, clock.instant().truncatedTo(ChronoUnit.MICROS));
        if (!notifications.existsIncludingDeleted(userId, id)) throw NotificationException.notFound();
    }
}
