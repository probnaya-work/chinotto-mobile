#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(ThoughtMeaning, NSObject)

RCT_EXTERN_METHOD(score:(NSString *)source
                  candidates:(NSArray<NSString *> *)candidates
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

@end
