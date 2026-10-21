#include <cstdio>
#include <cstdlib>
#include SRWF_MMIO_SOURCE

SaturnConfig g_cfg;
SH2Context g_master;
SH2Context g_slave;
SH2Context* g_cpu = &g_master;
static unsigned note_count;
static unsigned trace_count;
uint64_t sat_vblanks() { return 100; }
void sat_note(const char*, ...) { ++note_count; }
void sat_trace(const char*, ...) { ++trace_count; }

static void require(bool value, const char* label) {
    if (!value) {
        std::fprintf(stderr, "FAIL: %s\n", label);
        std::exit(1);
    }
}

int main() {
    g_master.budget = 2;
    log_reg(0x05890008, 2, 'R');
    log_reg(0x05890008, 2, 'R');
    log_reg(0x05B00420, 2, 'W');
    require(g_master.budget == -1, "MMIO poll budget must advance identically");
    log_area("VDP1 VRAM", 0x05C00020, 'W');
    log_area("VDP1 VRAM", 0x05C00010, 'W');
#if defined(SRWF_MOBILE_LOW_OVERHEAD) && SRWF_MOBILE_LOW_OVERHEAD
    require(g_regs.empty(), "mobile register aggregate maps disabled");
    require(g_areas.empty(), "mobile area aggregate maps disabled");
#else
    require(g_regs.size() == 2, "default register map identity");
    require(g_regs[{0x05890008, 2, 'R'}] == 2, "default register count");
    require(g_regs[{0x05B00420, 2, 'W'}] == 1, "default write count");
    require(g_areas.size() == 1, "default area map identity");
    const auto& a = g_areas[{"VDP1 VRAM", 'W'}];
    require(a.n == 2 && a.lo == 0x05C00010 && a.hi == 0x05C00020, "default area range and count");
#endif
    mmio_watch(0x05C00010, 0x05C00010);
    log_area("VDP1 VRAM", 0x05C00010, 'R');
    require(g_watch[{0x05C00010, 'R'}] == 1, "explicit watch counting preserved");
    require(trace_count == 1 && note_count == 0, "explicit default trace preserved");
    g_cfg.watch_from = 90;
    g_cfg.watch_to = 110;
    log_area("VDP1 VRAM", 0x05C00010, 'R');
    require(g_watch[{0x05C00010, 'R'}] == 2, "window watch counting preserved");
    require(trace_count == 1 && note_count == 1, "explicit window note preserved");
    const unsigned before_notes = note_count, before_traces = trace_count;
    g_cfg.watch_to = 95;
    log_area("VDP1 VRAM", 0x05C00010, 'R');
    require(g_watch[{0x05C00010, 'R'}] == 3, "out-of-window watch count preserved");
    require(trace_count == before_traces && note_count == before_notes, "out-of-window output preserved");
    require(g_master.budget == -1, "area logging must not change guest budget");
    std::puts("PASS: MMIO budget, default counters, mobile opt-in counters, explicit watches");
}
