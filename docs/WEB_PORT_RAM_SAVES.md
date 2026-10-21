# Web port RAM save interoperability

The RAM menu imports selected SRW records from standard Saturn backup filesystems
into the existing web-port internal save store. This is not emulator save-state
conversion, and it does not add an emulated cartridge device.

Supported representations: packed 32 KiB internal RAM; packed 512 KiB, 1 MiB,
2 MiB and 4 MiB cartridge RAM; FF/byte interleaving of those sizes (up to 8 MiB
physical size). Extensions are hints only. Header, size, block allocation chain,
record metadata and payload bounds must validate. Expanded internal RAM and SSF
individual-save containers are rejected. Export choices are packed 32 KiB
`.bkr`/`.srm`, interleaved 64 KiB `.bin`, or packed 512 KiB `.bcr`.

The filename is chosen by the destination emulator/configuration; renaming alone
cannot convert a representation. These layouts are documented in upstream source:

- [Ymir backup filesystem](https://github.com/ymir-emu/Ymir/blob/main/libs/ymir-core/src/ymir/sys/backup_ram.cpp)
- [Yabause memory implementation](https://github.com/Yabause/yabause/blob/master/yabause/src/memory.c)
- [Beetle Saturn libretro](https://github.com/libretro/beetle-saturn-libretro/blob/master/libretro.c)

Do not claim every release of Beetle, Yabause, Yaba Sanshiro, Ymir, SSF or
Saturn.emu has been individually verified. In particular, complete emulator states
are not interchangeable and are not accepted here.

## Safety

Parsing runs in a short-lived worker only while the game is stopped. No audio,
core, frame pacing or runtime binary changes are involved. Preview selects nothing
by default. Only `SROBOT_F_XX` or `SROBOTFC_XX` records matching the chosen game can
be merged. Name collisions require explicit replacement consent. The existing
32 KiB internal allocation limit applies; capacity failure changes nothing.

The original v1 IndexedDB schema, JSON backup, autosave and game keys are retained.
Import takes the same per-game navigator lock as playback, compares the preview's
save snapshot inside the write transaction, and atomically writes the new save,
a separate recovery point and an immutable import history record. Normal autosaves
cannot overwrite these separate recovery keys. Storage/transaction failure rolls
back all writes. Restore archives the replaced save in the same manner.

Export creates a new file; it does not overwrite the user's emulator files. Keep
original RAM images (especially images containing other games) separately. Browser
storage can still be cleared by the user/browser; downloaded backups are recommended.

## Validation

- Synthetic independent fragmented-block fixture; big/little endian metadata.
- All supported geometries and interleaving; block-list spanning; size boundaries.
- Corrupted headers/chains, cyclic chains, capacity and wrong-game rejection.
- Collision consent and preservation of unrelated existing records.
- Browser IndexedDB (private harness on a fresh localhost origin): import, recovery after autosave, stale snapshot rejection,
  restore, other-game isolation and forced transaction-abort rollback.
- Private F and Final 12,624-byte saves: packed/internal-interleaved/cartridge
  conversions preserve web-save metadata and payload byte for byte. No save files
  are distributed in this repository.
- Imported Final map RAM: the web port booted, recognized the save, and resumed
  the tactical map through the title screen Continue option using the new desktop
  controller.

Actual destination-emulator gameplay round trips remain a separate validation step.
