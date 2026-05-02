#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(NativeMapClusteringModule, NSObject)
RCT_EXTERN_METHOD(buildClusters:(NSArray *)points
                  zoom:(nonnull NSNumber *)zoom
                  bounds:(NSDictionary *)bounds
                  options:(NSDictionary *)options
                  resolver:(RCTPromiseResolveBlock)resolver
                  rejecter:(RCTPromiseRejectBlock)rejecter)

RCT_EXTERN_METHOD(buildFullHierarchyGeoJSON:(NSArray *)points options:(NSDictionary *)options resolver:(RCTPromiseResolveBlock)resolver rejecter:(RCTPromiseRejectBlock)rejecter)
RCT_EXTERN_METHOD(getGeoJsonForZoom:(NSString *)datasetId zoom:(NSInteger)zoom resolver:(RCTPromiseResolveBlock)resolver rejecter:(RCTPromiseRejectBlock)rejecter)
RCT_EXTERN_METHOD(getLeaves:(NSString *)clusterId limit:(NSInteger)limit offset:(NSInteger)offset resolver:(RCTPromiseResolveBlock)resolver rejecter:(RCTPromiseRejectBlock)rejecter)
RCT_EXTERN_METHOD(getExpansionZoom:(NSString *)clusterId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
@end
