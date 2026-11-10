Pod::Spec.new do |s|
  s.name = 'DioPencil'
  s.version = '1.0.0'
  s.summary = 'Apple Pencil double-tap events'
  s.description = 'Forwards Apple Pencil double-tap to DIO so the editor can switch between pen and eraser.'
  s.license = 'MIT'
  s.author = 'DIO'
  s.homepage = 'https://lab.ssafy.com/s15-final/S15P31F106'
  s.source = { :git => 'https://lab.ssafy.com/s15-final/S15P31F106.git' }
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
end
