package com.f106.DIO.cutout.service;

import java.io.IOException;
import java.io.InputStream;
import java.util.UUID;
import java.util.concurrent.Semaphore;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import com.f106.DIO.cutout.client.CutoutAiClient;
import com.f106.DIO.cutout.dto.CutoutCreatedResponse;
import com.f106.DIO.cutout.dto.CutoutPreviewResponse;
import com.f106.DIO.cutout.dto.CutoutSelectionRequest;
import com.f106.DIO.cutout.support.CutoutException;
import com.f106.DIO.media.dto.MediaFileResponse;
import com.f106.DIO.media.service.MediaService;

/** 사진 속 대상 오리기: 사진 분석 → 붓질 미리보기 → 결과 PNG → 보관함 저장. 로그인 사용자 전용. */
@Service
public class StickerCutoutService {
	@org.springframework.beans.factory.annotation.Autowired private com.f106.DIO.inventory.InventoryLimits inventory;
	private static final int MAX_PHOTO_BYTES = 20 * 1024 * 1024;
	private final CutoutAiClient ai;
	private final CutoutSessions sessions;
	private final MediaService media;
	// 사진 분석은 AI 서버 CPU 를 몇 초씩 쓴다. 동시에 너무 많이 보내지 않도록 이 프로세스에서 먼저 막는다.
	private final Semaphore uploads;

	public StickerCutoutService(CutoutAiClient ai, CutoutSessions sessions, MediaService media,
			@Value("${dio.cutout.max-concurrent-uploads:2}") int maxConcurrentUploads) {
		if (maxConcurrentUploads < 1) throw new IllegalArgumentException("Invalid cutout upload limit");
		this.ai = ai; this.sessions = sessions; this.media = media; this.uploads = new Semaphore(maxConcurrentUploads, true);
	}

	public CutoutCreatedResponse open(MultipartFile photo, Long userId) {
		byte[] content = read(photo);
		if (!uploads.tryAcquire()) throw CutoutException.busy();
		try {
			CutoutAiClient.UploadedImage image = ai.upload(content);
			CutoutSessions.Session session = sessions.open(userId, image.imageId());
			return new CutoutCreatedResponse(session.cutoutId(), image.width(), image.height(), sessions.expiresAt(session));
		} finally { uploads.release(); }
	}

	public CutoutPreviewResponse segment(UUID cutoutId, CutoutSelectionRequest selection, Long userId) {
		CutoutAiClient.Preview preview = ai.segment(sessions.use(cutoutId, userId).imageId(), selection);
		return new CutoutPreviewResponse(preview.preview(), preview.segmentMs());
	}

	public byte[] render(UUID cutoutId, CutoutSelectionRequest selection, Long userId) {
		return ai.render(sessions.use(cutoutId, userId).imageId(), selection);
	}

	/** 서버에서 다시 만든 PNG 만 저장한다. 앱이 보낸 이미지를 AI 결과로 저장하지 않는다. */
	public MediaFileResponse save(UUID cutoutId, CutoutSelectionRequest selection, Long userId) {
		UUID reservation=inventory.reserveMedia(userId,"STICKER");
		try{return media.storeAiSticker(render(cutoutId, selection, userId), userId,reservation);}
		finally{inventory.releaseMedia(reservation);}
	}

	public void close(UUID cutoutId, Long userId) { sessions.close(cutoutId, userId); }

	private static byte[] read(MultipartFile photo) {
		if (photo == null || photo.isEmpty()) throw CutoutException.invalidImage();
		if (photo.getSize() > MAX_PHOTO_BYTES) throw CutoutException.imageTooLarge();
		try (InputStream in = photo.getInputStream()) {
			byte[] content = in.readNBytes(MAX_PHOTO_BYTES + 1);
			if (content.length > MAX_PHOTO_BYTES) throw CutoutException.imageTooLarge();
			return content;
		} catch (IOException error) { throw CutoutException.invalidImage(); }
	}
}
