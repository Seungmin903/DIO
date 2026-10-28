package com.f106.DIO.media.dto;

import java.util.List;

public record MediaFileListResponse(List<MediaFileResponse> mediaFiles, String nextCursor) {}
