package com.f106.DIO.user.integration;

import com.f106.DIO.user.controller.UserController;
import com.f106.DIO.user.exception.UserException;
import com.f106.DIO.user.exception.UserExceptionHandler;
import com.f106.DIO.user.exception.UserRequestExceptionHandler;
import com.f106.DIO.user.service.UserPhotoService;
import com.f106.DIO.user.service.UserService;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class UserExceptionHandlerTests {
    private MockMvc mvc() {
        return MockMvcBuilders.standaloneSetup(new FutureController(),
                new UserController(mock(UserService.class), mock(UserPhotoService.class)))
            .setControllerAdvice(new UserExceptionHandler(), new UserRequestExceptionHandler()).build();
    }

    @RestController
    static class FutureController {
        @GetMapping("/test/future-user")
        public void userError() {
            throw UserException.conflict("EMAIL_ALREADY_REGISTERED", "이미 가입된 이메일이에요.");
        }
        @GetMapping("/test/future-validation")
        public void missingParameter(@org.springframework.web.bind.annotation.RequestParam String required) {}
    }

    @Test void userErrorFromUnlistedControllerKeepsStatusCodeAndDetail() throws Exception {
        mvc().perform(get("/test/future-user"))
            .andExpect(status().isConflict())
            .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("$.code").value("EMAIL_ALREADY_REGISTERED"))
            .andExpect(jsonPath("$.detail").value("이미 가입된 이메일이에요."));
    }

    @Test void existingUserValidationStillReturnsProblemDetail() throws Exception {
        mvc().perform(post("/api/v1/auth/email-availability")
                .contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"invalid\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(jsonPath("$.status").value(400));
    }

    @Test void globalUserAdviceDoesNotHandleUnrelatedMvcErrors() throws Exception {
        mvc().perform(get("/test/future-validation"))
            .andExpect(status().isBadRequest()).andExpect(content().string(""));
    }
}
