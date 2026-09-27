//! extern declarations for the subset of libvips's C API needed by lib-native.
//! Verified 2026-09-06 against libvips 8.18.6 headers, `nm -D libvips.so`, and `vips -l`
//! (docs/backlog/2026-09-06_libvips-signature-verification.md) — not from memory.
//!
//! Almost every vips operation is GObject-style variadic and NULL-terminated
//! (`G_GNUC_NULL_TERMINATED` in the C headers): optional args are passed as
//! ("property_name", value, ...) pairs, and every call must end with an
//! explicit null sentinel — there is no fixed-arity equivalent.

const std = @import("std");

pub const VipsImage = opaque {};

/// vips/image.h — VipsBandFormat
pub const BandFormat = enum(c_int) {
    notset = -1,
    uchar = 0,
    char = 1,
    ushort = 2,
    short = 3,
    uint = 4,
    int = 5,
    float = 6,
    complex = 7,
    double = 8,
    dpcomplex = 9,
    last = 10,
};

/// vips/image.h — VipsInterpretation (subset actually used here)
pub const Interpretation = enum(c_int) {
    multiband = 0,
    srgb = 22,
};

/// vips/conversion.h — VipsBlendMode
pub const BlendMode = enum(c_int) {
    clear = 0,
    source = 1,
    over = 2,
    in = 3,
    out = 4,
    atop = 5,
    dest = 6,
    dest_over = 7,
    dest_in = 8,
    dest_out = 9,
    dest_atop = 10,
    xor = 11,
    add = 12,
    saturate = 13,
    multiply = 14,
    screen = 15,
    overlay = 16,
    darken = 17,
    lighten = 18,
    colour_dodge = 19,
    colour_burn = 20,
    hard_light = 21,
    soft_light = 22,
    difference = 23,
    exclusion = 24,
    last = 25,
};

// -- lifecycle (vips/vips.h) --
pub extern "c" fn vips_init(argv0: [*:0]const u8) c_int;
pub extern "c" fn vips_shutdown() void;

// -- vips/error.h --
pub extern "c" fn vips_error_buffer() [*:0]const u8;

// -- glib (transitively linked via pkg-config vips) --
pub extern "c" fn g_object_unref(object: *anyopaque) void;
pub extern "c" fn g_free(mem: ?*anyopaque) void;

// -- vips/image.h --
// Not variadic — plain positional constructor, wraps caller-owned memory
// without copying (caller must keep `data` alive for the image's lifetime).
pub extern "c" fn vips_image_new_from_memory(
    data: ?*const anyopaque,
    size: usize,
    width: c_int,
    height: c_int,
    bands: c_int,
    format: BandFormat,
) ?*VipsImage;

pub extern "c" fn vips_image_new_from_buffer(
    buf: ?*const anyopaque,
    len: usize,
    option_string: [*:0]const u8,
    ...
) ?*VipsImage;

pub extern "c" fn vips_image_write_to_buffer(
    in: *VipsImage,
    suffix: [*:0]const u8,
    buf: *?*anyopaque,
    size: *usize,
    ...
) c_int;

// -- vips/conversion.h --
// Used to tag metadata (e.g. interpretation) on an image without touching
// pixels — vips_image_new_from_memory leaves interpretation as `multiband`,
// which operations like composite2 refuse to blend (no colour route to sRGB).
pub extern "c" fn vips_copy(
    in: *VipsImage,
    out: *?*VipsImage,
    ...
) c_int;

// -- vips/convolution.h --
pub extern "c" fn vips_gaussblur(
    in: *VipsImage,
    out: *?*VipsImage,
    sigma: f64,
    ...
) c_int;

// -- vips/resample.h --
// Positional args are only the 2x2 linear part (a,b;c,d); translation is an
// optional named vararg ("odx"/"ody"), not a positional parameter.
pub extern "c" fn vips_affine(
    in: *VipsImage,
    out: *?*VipsImage,
    a: f64,
    b: f64,
    c: f64,
    d: f64,
    ...
) c_int;

// libvips has no vips_perspective — projective/homography warp goes through
// this instead: `index` is a caller-built per-pixel coordinate map image
// (2-band float, x/y source coords), vips only resamples through it.
pub extern "c" fn vips_mapim(
    in: *VipsImage,
    out: *?*VipsImage,
    index: *VipsImage,
    ...
) c_int;

// -- vips/conversion.h --
pub extern "c" fn vips_composite2(
    base: *VipsImage,
    overlay: *VipsImage,
    out: *?*VipsImage,
    mode: BlendMode,
    ...
) c_int;

pub extern "c" fn vips_composite(
    in: [*]const *VipsImage,
    out: *?*VipsImage,
    n: c_int,
    mode: [*]const c_int,
    ...
) c_int;

pub extern "c" fn vips_extract_band(
    in: *VipsImage,
    out: *?*VipsImage,
    band: c_int,
    ...
) c_int;

pub extern "c" fn vips_bandjoin_const(
    in: *VipsImage,
    out: *?*VipsImage,
    c: [*]const f64,
    n: c_int,
    ...
) c_int;
