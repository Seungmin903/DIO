package com.f106.DIO.moderation.infrastructure.mail;

/** Confirmed invalid evidence; unlike storage availability failures, retrying cannot repair these bytes. */
public class InvalidReportMailEvidenceException extends RuntimeException {
    public InvalidReportMailEvidenceException(){super("Invalid report evidence");}
    public InvalidReportMailEvidenceException(Throwable cause){super("Invalid report evidence",cause);}
}
