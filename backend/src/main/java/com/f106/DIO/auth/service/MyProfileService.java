package com.f106.DIO.auth.service;

import com.f106.DIO.auth.dto.LoginUserResponse;
import com.f106.DIO.auth.exception.LoginException;
import com.f106.DIO.user.domain.User;
import com.f106.DIO.user.dto.ProfileUpdateRequest;
import com.f106.DIO.user.repository.ProfilePhotoRepository;
import com.f106.DIO.user.repository.UserRepository;
import com.f106.DIO.diary.repository.DiaryMemberRepository;
import com.f106.DIO.sharing.domain.DiaryMembershipChanged;
import com.f106.DIO.user.service.UserPhotoService;
import com.f106.DIO.user.service.UserWithdrawalService;
import java.time.Instant;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;

@Service
public class MyProfileService {
    private final UserRepository users;
    private final ProfilePhotoRepository photos;
    private final UserPhotoService photoService;
    private final UserWithdrawalService withdrawal;
    private final DiaryMemberRepository members;private final org.springframework.context.ApplicationEventPublisher events;
    private final TransactionTemplate writeTransaction;

    public MyProfileService(UserRepository users, ProfilePhotoRepository photos, UserPhotoService photoService,
            UserWithdrawalService withdrawal, DiaryMemberRepository members, PlatformTransactionManager manager, org.springframework.context.ApplicationEventPublisher events) {
        this.users = users;
        this.photos = photos;
        this.photoService = photoService;
        this.withdrawal = withdrawal;
        this.members=members;this.events=events;
        writeTransaction = new TransactionTemplate(manager);
    }

    @Transactional(readOnly = true)
    public LoginUserResponse profile(long userId) {
        var user = activeUser(userId);
        return response(user, photos.findByUserId(userId).map(photo -> photo.url()).orElse(null));
    }

    @Transactional(propagation = Propagation.NEVER)
    public LoginUserResponse update(long userId, ProfileUpdateRequest request, MultipartFile photo) {
        byte[] bytes = photoService.prepareImage(photo);
        try (var pending = photoService.upload(bytes)) {
            return writeTransaction.execute(status -> {
                var user = activeUser(userId);
                Instant now = Instant.now();
                boolean nicknameChanged=!request.nickname().equals(user.getNickname());
                if (nicknameChanged) {
                    user.changeNickname(request.nickname(), now);
                }
                if (pending != null) {
                    pending.enlist();
                }
                String url = photoService.replace(userId, pending, Boolean.TRUE.equals(request.removeProfilePhoto()), now);
                if(membershipAppearanceChanged(nicknameChanged,pending!=null,Boolean.TRUE.equals(request.removeProfilePhoto())))members.activeDiaryIdsByUserId(userId).forEach(id->events.publishEvent(new DiaryMembershipChanged(id)));
                return response(user, url);
            });
        }
    }

    public void withdraw(long userId) {
        withdrawal.withdraw(userId);
    }

    private User activeUser(long userId) {
        return users.findById(userId).filter(User::isActive).orElseThrow(() ->
            LoginException.token());
    }

    private LoginUserResponse response(User user, String photoUrl) {
        return new LoginUserResponse(user.getUserId().toString(), user.getEmail(), user.getNickname(), photoUrl);
    }
    public static boolean membershipAppearanceChanged(boolean nicknameChanged,boolean replacingPhoto,boolean removingPhoto){return nicknameChanged||replacingPhoto||removingPhoto;}
}
