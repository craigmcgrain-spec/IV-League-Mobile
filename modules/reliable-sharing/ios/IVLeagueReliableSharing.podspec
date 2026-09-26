Pod::Spec.new do |s|
  s.name           = 'IVLeagueReliableSharing'
  s.version        = '1.0.0'
  s.summary        = 'Privacy-conscious report sharing for The IV League II.'
  s.description    = 'Renders app-generated PDF reports as shareable images.'
  s.license        = { :type => 'UNLICENSED' }
  s.author         = 'The IV League II'
  s.homepage       = 'https://github.com/craigmcgrain-spec/IV-League-Mobile'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { :git => 'https://github.com/craigmcgrain-spec/IV-League-Mobile.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'PDFKit', 'UIKit'
  s.source_files = '**/*.swift'
end
