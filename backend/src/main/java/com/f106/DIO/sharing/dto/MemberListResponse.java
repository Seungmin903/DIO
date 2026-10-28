package com.f106.DIO.sharing.dto;
import java.util.List;
public record MemberListResponse(List<MemberResponse> members,int currentMembers,int maxMembers) {}
