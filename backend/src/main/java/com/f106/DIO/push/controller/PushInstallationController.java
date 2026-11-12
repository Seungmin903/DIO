package com.f106.DIO.push.controller;

import com.f106.DIO.push.service.PushInstallationService;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/push/installations")
public class PushInstallationController {
    private final PushInstallationService service;
    public PushInstallationController(PushInstallationService service){this.service=service;}
    public record Register(UUID installationId,UUID requestId,PushInstallationService.Input settings) {}
    public record Mutation(UUID requestId,String bindingVersion,PushInstallationService.Input settings) {}
    private static long version(String value){try{return Long.parseLong(value);}catch(RuntimeException e){throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST,"INVALID_PUSH_VERSION");}}
    @PostMapping public ResponseEntity<PushInstallationService.Registration> register(@AuthenticationPrincipal Jwt jwt,@RequestBody Register input){
        return ResponseEntity.status(201).cacheControl(CacheControl.noStore()).body(service.register(jwt,input.installationId(),input.requestId(),input.settings()));
    }
    @GetMapping("/{id}") public ResponseEntity<PushInstallationService.State> get(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.get(jwt,id));}
    @GetMapping("/{id}/binding") public ResponseEntity<PushInstallationService.State> inspectBinding(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@RequestHeader("X-DIO-Installation-Secret") String secret){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.inspectBinding(jwt,id,secret));}
    @PutMapping("/{id}") public ResponseEntity<PushInstallationService.State> update(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@RequestHeader("X-DIO-Installation-Secret") String secret,@RequestBody Mutation input){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.mutate(jwt,id,input.requestId(),secret,version(input.bindingVersion()),"UPDATE",input.settings()));}
    @PostMapping("/{id}/binding") public ResponseEntity<PushInstallationService.State> bind(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@RequestHeader("X-DIO-Installation-Secret") String secret,@RequestBody Mutation input){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.mutate(jwt,id,input.requestId(),secret,version(input.bindingVersion()),"BIND",null));}
    @DeleteMapping("/{id}/binding") public ResponseEntity<Void> unbind(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@RequestHeader("X-DIO-Installation-Secret") String secret,@RequestBody Mutation input){service.mutate(jwt,id,input.requestId(),secret,version(input.bindingVersion()),"UNBIND",null);return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();}
}
