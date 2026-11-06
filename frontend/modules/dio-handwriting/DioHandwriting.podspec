require 'digest'
require 'json'

models = 'android/src/main/assets/dio_handwriting'
if ENV['DIO_REQUIRE_IOS_HANDWRITING'] == '1'
  model_dir = File.join(__dir__, models)
  manifest = JSON.parse(File.read(File.join(model_dir, 'manifest.json')))
  %w[encoder.fp32.onnx decoder.fp32.onnx].each do |name|
    path = File.join(model_dir, name)
    unless File.file?(path) && Digest::SHA256.file(path).hexdigest == manifest.fetch('files').fetch(name).fetch('sha256')
      raise "Missing or invalid handwriting model #{name}. Run frontend/scripts/prepare-handwriting-models.ps1 before uploading the iOS build."
    end
  end
end

Pod::Spec.new do |s|
  s.name = 'DioHandwriting'
  s.version = '1.0.0'
  s.summary = 'On-device handwriting font generation'
  s.license = 'MIT'
  s.author = 'DIO'
  s.homepage = 'https://lab.ssafy.com/s15-final/S15P31F106'
  s.source = { :git => 'https://lab.ssafy.com/s15-final/S15P31F106.git' }
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.dependency 'onnxruntime-objc', '1.23.0'
  s.source_files = 'ios/*.swift'
  s.resource_bundles = {
    'DioHandwritingModels' => ["#{models}/*.onnx", "#{models}/manifest.json", "#{models}/LICENSE",
                               "#{models}/NOTICE", 'ios/ONNXRuntime-LICENSE.txt']
  }
end
