Pod::Spec.new do |s|
  s.name = 'DioPdfRender'
  s.version = '1.0.0'
  s.summary = 'PDF page rasterizer'
  s.description = 'Renders PDF pages at a chosen resolution for DIO development builds.'
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
