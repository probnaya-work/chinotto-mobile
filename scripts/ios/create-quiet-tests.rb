# Creates a standalone XCTest runner outside the app project; does not alter signing.
require 'xcodeproj'
require 'fileutils'

abort 'usage: ruby scripts/ios/create-quiet-tests.rb OUTPUT_DIRECTORY' unless ARGV.length == 1
root = File.expand_path(ARGV.first)
FileUtils.mkdir_p(root)
project_path = File.join(root, 'QuietScenarioTests.xcodeproj')
abort 'output project already exists' if File.exist?(project_path)
project = Xcodeproj::Project.new(project_path)
target = project.new_target(:ui_test_bundle, 'QuietScenarioTests', :ios, '17.0', nil, :swift)
source = project.main_group.new_file(File.join(__dir__, 'QuietScenarioTests.swift'))
target.source_build_phase.add_file_reference(source)
target.build_configurations.each do |configuration|
  configuration.build_settings.merge!({
    'SWIFT_VERSION' => '5.0',
    'PRODUCT_BUNDLE_IDENTIFIER' => 'com.chinotto.quiet.verification',
    'GENERATE_INFOPLIST_FILE' => 'YES',
    'TARGETED_DEVICE_FAMILY' => '1',
    'CODE_SIGNING_ALLOWED' => 'NO',
  })
end
project.save
scheme = Xcodeproj::XCScheme.new
scheme.add_build_target(target, false)
scheme.add_test_target(target)
scheme.save_as(project_path, 'QuietScenarioTests', true)
puts project_path
