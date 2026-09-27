const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    const exe_mod = b.createModule(.{
        .root_source_file = b.path("src/main.zig"),
        .target = target,
        .optimize = optimize,
        .link_libc = true,
    });

    // linkSystemLibrary defaults to use_pkg_config = .yes, i.e. it runs
    // `pkg-config vips --cflags --libs` and only falls back to bare -lvips
    // if that fails. vips.pc's transitive Requires (glib/gobject/gio) are
    // already included in that output, so one call is enough.
    exe_mod.linkSystemLibrary("vips", .{});

    const exe = b.addExecutable(.{
        .name = "lib-native-smoke",
        .root_module = exe_mod,
    });
    b.installArtifact(exe);

    const run_cmd = b.addRunArtifact(exe);
    run_cmd.step.dependOn(b.getInstallStep());
    if (b.args) |args| run_cmd.addArgs(args);

    const run_step = b.step("run", "Run the libvips smoke test");
    run_step.dependOn(&run_cmd.step);
}
