#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(AudioPlaybackModule, RCTEventEmitter)

RCT_EXTERN_METHOD(play:(NSDictionary *)options
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(stop)

+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

@end
