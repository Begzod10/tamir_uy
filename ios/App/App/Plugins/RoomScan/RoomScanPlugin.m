//
// RoomScanPlugin.m
// Objective-C bridge — registers RoomScanPlugin with Capacitor's plugin
// discovery system.  The CAP_PLUGIN macro wires the Swift class name to the
// string "RoomScanPlugin" that JavaScript's Capacitor.Plugins namespace uses.
//
// After running `npx cap add ios`, add both this file and RoomScanPlugin.swift
// to the App Xcode target (File → Add Files, or drag into the Project navigator).
// Also add "RoomPlan.framework" to the target's Frameworks, Libraries, and
// Embedded Content (it is a system framework — no CocoaPods entry needed).
//
#import <Capacitor/CAPBridgeViewController.h>
#import <Capacitor/CAPPlugin.h>
#import <Foundation/Foundation.h>

CAP_PLUGIN(RoomScanPlugin, "RoomScanPlugin",
    CAP_PLUGIN_METHOD(startScan, CAPPluginReturnPromise);
)
