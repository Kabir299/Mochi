Pod::Spec.new do |s|
  s.name           = 'MochiCallState'
  s.version        = '1.0.0'
  s.summary        = 'Tells whether a call is going on'
  s.description    = 'Tells whether a call is going on'
  s.license        = 'MIT'
  s.author         = 'Mochi'
  s.homepage       = 'https://github.com/Kabir299/Mochi'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
