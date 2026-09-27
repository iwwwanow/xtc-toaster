const std = @import("std");
const vips = @import("vips/bindings.zig");

// GObject/libvips varargs are NULL-terminated; every call below ends with
// this sentinel instead of a real optional (name, value) pair.
const NUL: ?*anyopaque = null;

fn checkRc(rc: c_int, what: []const u8) !void {
    if (rc != 0) {
        std.debug.print("{s} FAILED (rc={d}): {s}\n", .{ what, rc, vips.vips_error_buffer() });
        return error.VipsCallFailed;
    }
}

fn expectImage(v: ?*vips.VipsImage, what: []const u8) !*vips.VipsImage {
    return v orelse {
        std.debug.print("{s} produced a null image: {s}\n", .{ what, vips.vips_error_buffer() });
        return error.VipsCallFailed;
    };
}

pub fn main() !void {
    const init_rc = vips.vips_init("lib-native-smoke");
    if (init_rc != 0) {
        std.debug.print("vips_init FAILED (rc={d}): {s}\n", .{ init_rc, vips.vips_error_buffer() });
        return error.VipsInitFailed;
    }
    defer vips.vips_shutdown();

    // 4x4 RGBA test image — a small gradient so blur/composite/extract have
    // real pixel variation to chew on rather than a flat buffer.
    var pixels: [4 * 4 * 4]u8 = undefined;
    for (0..4) |y| {
        for (0..4) |x| {
            const i = (y * 4 + x) * 4;
            pixels[i + 0] = @intCast(x * 64);
            pixels[i + 1] = @intCast(y * 64);
            pixels[i + 2] = 128;
            pixels[i + 3] = 255;
        }
    }

    const raw = try expectImage(
        vips.vips_image_new_from_memory(&pixels, pixels.len, 4, 4, 4, .uchar),
        "vips_image_new_from_memory",
    );

    // vips_image_new_from_memory leaves interpretation as `multiband`;
    // composite2/composite refuse to blend without a real colourspace tag.
    var in_tagged: ?*vips.VipsImage = null;
    try checkRc(
        vips.vips_copy(raw, &in_tagged, "interpretation", @as(c_int, @intFromEnum(vips.Interpretation.srgb)), NUL),
        "vips_copy (tag interpretation)",
    );
    const in = try expectImage(in_tagged, "vips_copy (tag interpretation)");

    var out_blur: ?*vips.VipsImage = null;
    try checkRc(vips.vips_gaussblur(in, &out_blur, 1.5, NUL), "vips_gaussblur");
    _ = try expectImage(out_blur, "vips_gaussblur");

    var out_affine: ?*vips.VipsImage = null;
    try checkRc(vips.vips_affine(in, &out_affine, 1.0, 0.0, 0.0, 1.0, NUL), "vips_affine");
    _ = try expectImage(out_affine, "vips_affine");

    var out_composite2: ?*vips.VipsImage = null;
    try checkRc(vips.vips_composite2(in, in, &out_composite2, .over, NUL), "vips_composite2");
    _ = try expectImage(out_composite2, "vips_composite2");

    const composite_inputs = [_]*vips.VipsImage{ in, in };
    const composite_modes = [_]c_int{@intFromEnum(vips.BlendMode.over)};
    var out_composite: ?*vips.VipsImage = null;
    try checkRc(
        vips.vips_composite(&composite_inputs, &out_composite, 2, &composite_modes, NUL),
        "vips_composite",
    );
    _ = try expectImage(out_composite, "vips_composite");

    var out_band: ?*vips.VipsImage = null;
    try checkRc(vips.vips_extract_band(in, &out_band, 0, NUL), "vips_extract_band");
    const band_img = try expectImage(out_band, "vips_extract_band");

    const join_const = [_]f64{255.0};
    var out_joined: ?*vips.VipsImage = null;
    try checkRc(
        vips.vips_bandjoin_const(band_img, &out_joined, &join_const, 1, NUL),
        "vips_bandjoin_const",
    );
    _ = try expectImage(out_joined, "vips_bandjoin_const");

    // Identity coordinate map (2-band float: x, y per pixel) — proves
    // vips_mapim links and runs; the real homography math lands in 4b.
    var map_pixels: [4 * 4 * 2]f32 = undefined;
    for (0..4) |y| {
        for (0..4) |x| {
            const i = (y * 4 + x) * 2;
            map_pixels[i + 0] = @floatFromInt(x);
            map_pixels[i + 1] = @floatFromInt(y);
        }
    }
    const index_img = try expectImage(
        vips.vips_image_new_from_memory(&map_pixels, map_pixels.len * @sizeOf(f32), 4, 4, 2, .float),
        "vips_image_new_from_memory (index)",
    );

    var out_mapim: ?*vips.VipsImage = null;
    try checkRc(vips.vips_mapim(in, &out_mapim, index_img, NUL), "vips_mapim");
    _ = try expectImage(out_mapim, "vips_mapim");

    var buf: ?*anyopaque = null;
    var buf_size: usize = 0;
    try checkRc(
        vips.vips_image_write_to_buffer(in, ".png", &buf, &buf_size, NUL),
        "vips_image_write_to_buffer",
    );
    defer vips.g_free(buf);

    const decoded = try expectImage(
        vips.vips_image_new_from_buffer(buf, buf_size, "", NUL),
        "vips_image_new_from_buffer",
    );
    _ = decoded;

    std.debug.print(
        "OK — all bindings linked and ran: gaussblur, affine, composite2, composite, " ++
            "extract_band, bandjoin_const, mapim, image_new_from_buffer/write_to_buffer " ++
            "(PNG round-trip, {d} bytes)\n",
        .{buf_size},
    );
}
