package com.f106.DIO.collaboration;
import com.f106.DIO.collaboration.controller.CanvasCollaborationController;
import com.f106.DIO.collaboration.exception.CollaborationExceptionHandler;
import com.f106.DIO.collaboration.service.CanvasOperationService;
import com.f106.DIO.page.support.*;
import com.f106.DIO.diary.support.DiaryNotFoundException;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.method.support.*;
import org.springframework.core.MethodParameter;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
class CollaborationErrorContractTests {
    @Test void elementPageAndDiaryErrorsHaveDistinctCodes()throws Exception{
        var service=mock(CanvasOperationService.class);UUID page=UUID.randomUUID();
        var jwt=Jwt.withTokenValue("test").header("alg","HS256").subject("1").build();
        var mvc=MockMvcBuilders.standaloneSetup(new CanvasCollaborationController(service)).setControllerAdvice(new CollaborationExceptionHandler())
            .setCustomArgumentResolvers(new HandlerMethodArgumentResolver(){
                public boolean supportsParameter(MethodParameter parameter){return parameter.getParameterType()==Jwt.class;}
                public Object resolveArgument(MethodParameter parameter,ModelAndViewContainer container,NativeWebRequest request,WebDataBinderFactory binder){return jwt;}
            }).build();
        RuntimeException[] errors={new CanvasElementNotFoundException(),new PageNotFoundException(),new DiaryNotFoundException()};
        String[] codes={"CANVAS_ELEMENT_NOT_FOUND","PAGE_NOT_FOUND","DIARY_NOT_FOUND"};
        for(int i=0;i<errors.length;i++){
            reset(service);when(service.history(page,1L,0,20)).thenThrow(errors[i]);
            mvc.perform(get("/api/v1/pages/"+page+"/history/me")).andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value(codes[i]));
        }
    }
}
