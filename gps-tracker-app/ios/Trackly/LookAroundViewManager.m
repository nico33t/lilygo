#import <React/RCTViewManager.h>
#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(LookAroundViewManager, RCTViewManager)
RCT_EXPORT_VIEW_PROPERTY(coordinate, NSDictionary)
@end
