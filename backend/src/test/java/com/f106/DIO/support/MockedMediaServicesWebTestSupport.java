package com.f106.DIO.support;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.f106.DIO.cutout.service.StickerCutoutService;
import com.f106.DIO.media.library.service.SharedMediaLibraryService;
import com.f106.DIO.media.service.MediaService;

/**
 * 미디어·스티커 컨트롤러 테스트가 같은 목 구성을 써서 Spring 컨텍스트 하나를 함께 쓰게 한다.
 * 목 구성이 클래스마다 다르면 컨텍스트를 새로 띄우므로, 목을 추가할 때는 여기에 모은다.
 */
@SpringBootTest
@AutoConfigureMockMvc
public abstract class MockedMediaServicesWebTestSupport {
	@Autowired protected MockMvc mvc;
	@MockitoBean protected StickerCutoutService stickerCutoutService;
	@MockitoBean protected MediaService mediaService;
	@MockitoBean protected SharedMediaLibraryService sharedMediaLibraryService;
}
