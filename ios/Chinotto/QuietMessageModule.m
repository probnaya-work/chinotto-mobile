#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(QuietMessageModule, NSObject)
RCT_EXTERN_METHOD(compose:(NSString *)body
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
@end
