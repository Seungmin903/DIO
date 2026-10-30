package com.f106.DIO.sharing.dto;
import java.util.List;
public record EmailInvitePageResponse(List<EmailInviteResponse> items,int page,int size,boolean hasNext,long totalElements) {}
