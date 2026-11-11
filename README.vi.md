# Agent Office

[English](README.md) · Tiếng Việt

Các phiên Claude Code thành nhân vật trên sân khấu pixel nhìn ngang. Mỗi phiên có một màn hình hologram: đang làm thì
gõ phím, chờ duyệt thì nhảy kèm dấu "!", commit thì tung chiêu, nghỉ thì tự sống (nhảy lên bục, ra xe cà phê, tán gẫu hay
đấu tập với người khác). Bấm vào ai để mở cảnh visual novel: Live2D, AI đang làm gì từng bước, câu trả lời gần nhất và ô
nhắn lại cho nó. Hình, sân khấu và giọng nói lấy từ bản game của chính bạn (`scripts/vn-assets.py`), không nằm trong repo này.

![Agent Office: tầng công ty với các phiên đang làm việc](docs/media/demo.gif)

> Dự án cộng đồng, không do Anthropic làm hay liên kết.

## Cài nhanh

Cần **Node.js 20.9+** và **Claude Code**. Chạy trên macOS, Linux và Windows.

```bash
git clone https://github.com/byocao/agent-office.git && cd agent-office
npm install
node bin/cli.mjs install --service   # thêm hook và chạy văn phòng ở chế độ nền
node bin/cli.mjs doctor              # kiểm tra mọi thứ đã chạy đúng
```

Mở <http://localhost:4310>. Muốn xem thử trước? Chạy `npm run dev` rồi mở <http://localhost:4310/?demo>
(phiên giả lập, không cần Claude Code).

`install` sao lưu `~/.claude/settings.json` trước khi sửa và chỉ thêm hook của mình. Gỡ toàn bộ:
`node bin/cli.mjs uninstall`.

Giao diện mặc định là tiếng Anh; đổi sang tiếng Việt ở **Cài đặt → Hiển thị** hoặc đặt `OFFICE_LANG=vi`.

## Lệnh

| Lệnh | Tác dụng |
| --- | --- |
| `install` | Thêm hook, status line và số liệu dùng (telemetry) vào Claude Code. |
| `uninstall` | Gỡ hết những thứ trên, giữ nguyên phần cài đặt còn lại. |
| `doctor` | Kiểm tra từng phần, báo thiếu gì và cách sửa. |
| `start` | Chạy server ngay trong cửa sổ terminal này. |
| `pin [--new]` | Xem (hoặc đổi) mã PIN để điện thoại đăng nhập. |

Tuỳ chọn của `install`:

- `--service`: tự chạy văn phòng khi đăng nhập máy.
- `--lan`: cho điện thoại cùng wifi mở được.
- `--no-approve`: không duyệt quyền từ văn phòng.
- `--no-status`: không đụng tới status line của bạn.
- `--no-otel`: không bật telemetry của Claude Code.

Log nằm ở `data/server.log`. `doctor` cũng in lệnh khởi động lại dịch vụ nền cho đúng hệ điều hành của bạn.

## Tính năng

**Theo dõi các phiên**
- Mỗi phiên là một người trong văn phòng. Trợ lý (subagent) đi vào nhận việc rồi quay về báo cáo.
- Màn hình trên bàn cho thấy phiên đang làm gì. Bàn bừa là còn file chưa commit; commit thì máy in in ra một trang,
  push thì tên lửa phóng, CI hỏng thì văn phòng chuyển đỏ.
- Dòng thời gian và xem lại 1 giờ hoặc cả ngày, thẻ tổng kết tuần, tủ cúp theo cột mốc.

**Trả lời Claude ngay trong văn phòng**
- Yêu cầu quyền, câu hỏi và kế hoạch hiện thành thẻ (phím Y / N / A).
- Lệnh nguy hiểm (`rm -rf`, force push, `sudo`, `curl | sh`, có chữ "prod") tô đỏ, phải bấm hai lần.
- Phiên gặp cùng một lỗi 3 lần liền thì bị chặn và được nhắc đổi cách khác.

**Theo dõi gói Claude và máy tính**
- Hạn mức gói (5 giờ và theo tuần), cảnh báo ở 80% và 95%. Hỗ trợ nhiều tài khoản Claude, tự đổi khi một tài khoản hết
  lượt.
- "Cái gì đang ăn gói": chi phí chia theo MCP, skill, subagent, model và dự án.
- RAM, CPU, ổ đĩa, dev server bị bỏ quên, phiên đang rảnh; dọn dẹp bằng một nút bấm.
- Việc bỏ quên: các worktree còn thay đổi chưa commit hoặc chưa push.

**Dùng trên điện thoại**
- Cùng wifi, qua Tailscale, hoặc ở bất cứ đâu qua đường hầm Cloudflare. Đăng nhập bằng mã PIN 6 số.
- Xem, duyệt lệnh (nếu bạn cho phép trên máy tính), nhắn tiếp một phiên hoặc giao việc mới cho Claude.
- Thông báo đẩy khi Claude trả lời hoặc cần bạn.

**Cho vui**
- Ba kiểu văn phòng, hai kiểu nhân vật, cảnh thành phố / đồng quê / biển, thời tiết thật, ngày và đêm.
- Phố phường Việt Nam sống động bên ngoài, nhóm chat công ty, chơi game, bida, karaoke khi phiên đang nghỉ.
- Đi dạo ở góc nhìn thứ nhất (WASD, E để tương tác), chế độ chụp ảnh (P) và clip 15 giây.

## An toàn

- **Mọi thứ chạy trên máy bạn.** Hook gửi tới `127.0.0.1`. Văn phòng tắt thì Claude Code vẫn chạy bình thường.
- Chuỗi giống mật khẩu, token, khoá API bị che trước khi lưu hay hiển thị.
- Thông tin đăng nhập Claude được đọc từ keychain mỗi lần dùng, không bao giờ lưu lại.
- Điện thoại chỉ kết nối được khi bạn bật, phải nhập PIN, và không duyệt được gì nếu bạn chưa cho phép.
- Mọi lần tắt tiến trình, dọn dẹp, duyệt quyền đều ghi vào `data/actions.log`.

Các kết nối mạng có thể tắt:

| Kết nối | Cách tắt |
| --- | --- |
| Hạn mức gói | `OFFICE_USAGE=0` |
| Trạng thái CI trên GitHub (qua `gh` đã đăng nhập) | `OFFICE_CI=0` |
| Dịch sang tiếng Việt | `OFFICE_TRANSLATE=0` |
| Thời tiết | để trống thành phố trong Cài đặt |

## Cấu hình

| Biến | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `OFFICE_PORT` | `4310` | Cổng |
| `OFFICE_HOST` | `127.0.0.1` | Địa chỉ lắng nghe (`install --lan` tự đặt) |
| `OFFICE_LANG` | `en` | Ngôn ngữ mặc định (`en` hoặc `vi`) |
| `OFFICE_DATA_DIR` | `data/` | Nơi văn phòng lưu dữ liệu |

## Phát triển

```bash
npm run dev                                    # http://localhost:4310/?demo, tự nạp lại khi sửa
npm run lint && npm run typecheck && npm test  # kiểm tra và unit test
npm run build && npm run test:e2e              # test end-to-end
```

| Phần | Thư mục | Công nghệ |
| --- | --- | --- |
| Server | `server/` | Node.js |
| Trang web | `app/`, `src/components/` | Next.js |
| Quán cà phê | `src/office/` | canvas thuần |
| Chữ trên giao diện | `src/i18n/locales/` | mỗi ngôn ngữ một thư mục |

Xem thêm [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) và [CONTRIBUTING.md](CONTRIBUTING.md).

## Ghi công

- Ý tưởng từ agents-at-work, cubicle-crew (MIT, mẫu lệnh nguy hiểm) và cc-reaper (Apache-2.0, luật RAM và CPU).
- qrcode.js (MIT); font Be Vietnam Pro và JetBrains Mono (SIL OFL).
- [Simple Icons](https://simpleicons.org) và [Kenney Car Kit](https://kenney.nl/assets/car-kit) (CC0);
  thời tiết từ [Open-Meteo](https://open-meteo.com).
- Tên cửa hàng và thương hiệu (Circle K, GS25, 7-Eleven, WinMart, Grab, Xanh SM, Shopee, Mixue, Highlands Coffee và
  các hãng khác) thuộc về chủ sở hữu. Cửa hàng được vẽ bằng code; xem `public/assets/brands/README.md`. Agent Office
  không liên kết với hãng nào.

## Giấy phép

[MIT](LICENSE)
