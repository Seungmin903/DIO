Pod::Spec.new do |s|
  s.name = 'DioStickerSplit'
  s.version = '1.0.0'
  s.summary = 'Offline sticker sheet segmentation'
  s.description = 'Local development-build-only sticker sheet processing for DIO.'
  s.license = 'MIT'
  s.author = 'DIO'
  s.homepage = 'https://lab.ssafy.com/s15-final/S15P31F106'
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.source = { :git => 'https://lab.ssafy.com/s15-final/S15P31F106.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
end
