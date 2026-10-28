package com.f106.DIO.diary.trash;

import java.time.Instant;
import org.springframework.stereotype.Component;

/** Single server-time source for retention decisions and response permissions. */
@Component
public class DiaryTime {
    public Instant now() { return Instant.now(); }
}
