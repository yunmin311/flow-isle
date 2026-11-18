//! The notification watcher uses a small, read-only subset of IMAP over implicit TLS.
use imap_proto::{
    AttributeValue, BodyContentCommon, BodyStructure, Capability, Envelope, MailboxDatum, RequestId, Response, ResponseCode, Status, SectionPath,
};
use std::collections::HashSet;
use std::io::{self, BufRead, BufReader, Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::time::Duration;

const MAX_FRAME: usize = 768 * 1024;
const IO_TIMEOUT: Duration = Duration::from_secs(20);
const ID_COMMAND: &str = concat!(
    "ID (\"name\" \"FlowIsle\" \"version\" \"",
    env!("CARGO_PKG_VERSION"),
    "\")"
);

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum Error {
    Host,
    Dns,
    Connect,
    Tls,
    Transport,
    Protocol,
    Closed,
    InvalidCredential,
    Rejected,
    Authentication,
    Mailbox,
    Search,
    BodyUnavailable,
    BodyTooLarge,
    BodyEncoding,
}

impl Error {
    pub(crate) fn message(&self, provider: &str) -> &'static str {
        match self {
            Self::BodyUnavailable => "邮件已移除或没有可读取的正文，请在网页邮箱中查看",
            Self::BodyTooLarge => "邮件正文超过 512 KB，请在网页邮箱中查看",
            Self::BodyEncoding => "邮件正文编码无效或暂不支持，请在网页邮箱中查看",
            Self::Host => "不支持的邮箱服务商，或自定义 IMAP 服务器地址无效",
            Self::Dns => "无法解析 IMAP 服务器，请检查服务器地址和网络",
            Self::Connect => "无法连接 IMAP 服务器（端口 993）",
            Self::Tls => "TLS 握手失败，请检查服务器证书、主机名和系统时间",
            Self::Transport => "IMAP 连接中断或超时，请检查网络",
            Self::Protocol => "IMAP 服务器返回了无法识别或格式错误的响应",
            Self::Closed => "IMAP 服务器关闭了连接，请稍后重试",
            Self::InvalidCredential => "邮箱地址或授权码含有不支持的控制字符",
            Self::Rejected => "IMAP 服务器拒绝了请求",
            Self::Mailbox => "无法打开 IMAP 收件箱",
            Self::Search => "无法搜索 IMAP 收件箱邮件",
            Self::Authentication => match provider {
                "qq" => "QQ 邮箱登录失败，请确认已开启 IMAP，并检查客户端授权码是否正确或已失效",
                "163" | "126" => {
                    "网易邮箱登录失败，请确认已开启 IMAP，并检查客户端授权码是否正确或已失效"
                }
                "gmail" => "Gmail 登录失败，请检查应用专用密码是否正确、已撤销或受账号政策限制",
                "outlook" => "Outlook 登录失败，Outlook.com 要求 OAuth2，当前版本只支持授权码登录",
                _ => "IMAP 登录失败，请确认已开启 IMAP，并检查授权码是否正确或已失效",
            },
        }
    }
}

pub(crate) fn email_imap_host(provider: &str, custom_host: &str) -> Option<String> {
    let host = match provider {
        "qq" => "imap.qq.com",
        "163" => "imap.163.com",
        "126" => "imap.126.com",
        "gmail" => "imap.gmail.com",
        "outlook" => "outlook.office365.com",
        "custom" => custom_host.trim(),
        _ => return None,
    };
    let name = host.strip_suffix('.').unwrap_or(host);
    if name.len() > 253
        || !name.split('.').all(|label| {
            !label.is_empty()
                && label.len() <= 63
                && label.as_bytes()[0].is_ascii_alphanumeric()
                && label.as_bytes()[label.len() - 1].is_ascii_alphanumeric()
                && label
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
        })
    {
        return None;
    }
    Some(host.to_ascii_lowercase())
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) struct Mail {
    pub uid: u32,
    pub from: String,
    pub subject: String,
    pub date: String,
}

// Adapted from Fly Island v3.0.8 (MIT); see THIRD_PARTY_NOTICES.md.
#[derive(Debug)]
struct TextPart {
    path: Vec<u32>,
    mime: &'static str,
    octets: u32,
    charset: String,
    encoding: String,
}

fn is_attachment(common: &BodyContentCommon<'_>) -> bool {
    common.disposition.as_ref().is_some_and(|disposition| {
        !disposition.ty.eq_ignore_ascii_case("inline")
            || disposition.params.as_ref().is_some_and(|params| {
                params
                    .iter()
                    .any(|(key, _)| key.split('*').next().is_some_and(|name| name.eq_ignore_ascii_case("filename")))
            })
    }) || common.ty.params.as_ref().is_some_and(|params| {
        params
            .iter()
            .any(|(key, _)| key.split('*').next().is_some_and(|name| name.eq_ignore_ascii_case("name")))
    })
}

fn text_part(body: &BodyStructure<'_>, path: Vec<u32>) -> Option<TextPart> {
    if path.len() > 16 {
        return None;
    }
    match body {
        BodyStructure::Text { common, other, .. } if !is_attachment(common) => {
            let mime = if common.ty.subtype.eq_ignore_ascii_case("plain") {
                "text/plain"
            } else if common.ty.subtype.eq_ignore_ascii_case("html") {
                "text/html"
            } else {
                return None;
            };
            Some(TextPart {
                path: if path.is_empty() { vec![1] } else { path },
                mime,
                octets: other.octets,
                charset: common.ty.params.as_ref().and_then(|p| p.iter().find(|(k, _)| k.eq_ignore_ascii_case("charset"))).map(|(_, v)| v.to_string()).unwrap_or_else(|| "us-ascii".into()),
                encoding: match &other.transfer_encoding {
                    imap_proto::ContentEncoding::Base64 => "base64",
                    imap_proto::ContentEncoding::QuotedPrintable => "quoted-printable",
                    imap_proto::ContentEncoding::SevenBit => "7bit",
                    imap_proto::ContentEncoding::EightBit => "8bit",
                    imap_proto::ContentEncoding::Binary => "binary",
                    _ => "unsupported",
                }.into(),
            })
        }
        BodyStructure::Multipart { common, bodies, .. } if !is_attachment(common) => {
            let mut fallback = None;
            for (index, body) in bodies.iter().take(128).enumerate() {
                let mut nested = path.clone();
                nested.push(index as u32 + 1);
                if let Some(part) = text_part(body, nested) {
                    // 优先渲染 HTML 版本：纯文本副本里没有排版和图片，图片只有在 HTML 里才存在。
                    if part.mime == "text/html" {
                        return Some(part);
                    }
                    if fallback.is_none() {
                        fallback = Some(part);
                    }
                }
            }
            fallback
        }
        // Forwarded messages and text attachments are separate from the mail's own body.
        _ => None,
    }
}

#[derive(Debug)]
struct ImagePart { path: Vec<u32>, cid: String, mime: String, octets: u32 }
fn image_parts(body: &BodyStructure<'_>, path: Vec<u32>, out: &mut Vec<ImagePart>) {
    if path.len() > 16 || out.len() >= 8 { return; }
    match body {
        BodyStructure::Basic { common, other, .. }
            if common.ty.ty.eq_ignore_ascii_case("image")
                && ["png", "jpeg", "gif", "webp"].iter().any(|s| common.ty.subtype.eq_ignore_ascii_case(s))
                && matches!(other.transfer_encoding, imap_proto::ContentEncoding::Base64)
                && other.octets <= 512 * 1024
                && !common.disposition.as_ref().is_some_and(|d| d.ty.eq_ignore_ascii_case("attachment")) => {
            if let Some(cid) = other.id.filter(|id| !id.is_empty() && id.len() <= 256) {
                out.push(ImagePart { path: if path.is_empty() { vec![1] } else { path }, cid: cid.trim_matches(['<', '>']).into(),
                    mime: format!("image/{}", common.ty.subtype.to_ascii_lowercase()), octets: other.octets });
            }
        }
        BodyStructure::Multipart { common, bodies, .. } if !is_attachment(common) => {
            for (index, body) in bodies.iter().take(128).enumerate() {
                let mut nested = path.clone(); nested.push(index as u32 + 1); image_parts(body, nested, out);
            }
        }
        _ => ()
    }
}

#[derive(Default)]
struct Reply {
    uid_validity: Option<u32>,
    unread: Option<Vec<u32>>,
    supports_idle: Option<bool>,
    mail: Vec<Mail>,
    parts: Vec<(u32, Option<TextPart>)>,
    images: Vec<(u32, Vec<ImagePart>)>,
    sections: Vec<(u32, Option<u32>, Option<SectionPath>, Vec<u8>)>,
}

#[derive(Default)]
pub(crate) struct MailboxCursor {
    uid_validity: Option<u32>,
    seen: HashSet<u32>,
    max_uid: u32,
    baseline_done: bool,
}

impl MailboxCursor {
    // Selection must not acknowledge messages: failed FETCH is retried.
    pub(crate) fn pending(&mut self, uid_validity: u32, mut uids: Vec<u32>) -> Vec<u32> {
        uids.sort_unstable();
        uids.dedup();
        if self.uid_validity != Some(uid_validity) {
            self.uid_validity = Some(uid_validity);
            self.seen.clear();
            self.baseline_done = false;
            // Limit initial history to the latest 50 messages.
            self.max_uid = if uids.len() > 50 { uids[uids.len() - 51] } else { 0 };
        }
        self.seen.retain(|uid| uids.binary_search(uid).is_ok());
        uids.into_iter().filter(|uid| *uid > self.max_uid && !self.seen.contains(uid)).collect()
    }

    pub(crate) fn mark_seen(&mut self, uid: u32) {
        self.seen.insert(uid);
    }

    pub(crate) fn is_baseline_done(&self, uid_validity: u32) -> bool {
        self.baseline_done && self.uid_validity == Some(uid_validity)
    }

    pub(crate) fn mark_baseline_done(&mut self, uid_validity: u32) {
        if self.uid_validity == Some(uid_validity) {
            self.baseline_done = true;
        }
    }
}

// Gregorian date from UTC days since Unix epoch; IMAP SINCE uses English months.
fn recent_since() -> String {
    let days = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default().as_secs() / 86400;
    imap_date(days.saturating_sub(7) as i64)
}

fn imap_date(days: i64) -> String {
    let z = days + 719468;
    let era = z / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let mut year = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = mp + if mp < 10 { 3 } else { -9 };
    year += i64::from(month <= 2);
    let names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    format!("{day:02}-{}-{year}", names[(month - 1) as usize])
}

enum Frame<'a> {
    Id,
    Standard(Response<'a>),
}

pub(crate) struct Imap<S> {
    stream: BufReader<S>,
    next_tag: u64,
    frame: Vec<u8>,
}

impl<S: Read + Write> Imap<S> {
    pub(crate) fn new(stream: S) -> Result<Self, Error> {
        let mut session = Self {
            stream: BufReader::new(stream),
            next_tag: 0,
            frame: Vec::new(),
        };
        match session.read_frame(false).map_err(ReadError::public)? {
            Frame::Standard(Response::Data {
                status: Status::Ok, ..
            }) => Ok(session),
            Frame::Standard(Response::Data {
                status: Status::Bye,
                ..
            }) => Err(Error::Closed),
            _ => Err(Error::Protocol),
        }
    }

    pub(crate) fn open_inbox(
        &mut self,
        provider: &str,
        email: &str,
        secret: &str,
    ) -> Result<u32, Error> {
        self.command(&format!("LOGIN {} {}", quote(email)?, quote(secret)?))
            .map_err(|e| {
                if e == Error::Rejected {
                    Error::Authentication
                } else {
                    e
                }
            })?;
        if matches!(provider, "qq" | "163" | "126") {
            match self.command(ID_COMMAND) {
                Ok(_) | Err(Error::Rejected) => (),
                Err(error) => return Err(error),
            }
        }
        self.command("EXAMINE INBOX")
            .map_err(|e| {
                if e == Error::Rejected {
                    Error::Mailbox
                } else {
                    e
                }
            })?
            .uid_validity
            .ok_or(Error::Protocol)
    }

    pub(crate) fn supports_idle(&mut self) -> Result<bool, Error> {
        self.command("CAPABILITY")?
            .supports_idle
            .ok_or(Error::Protocol)
    }

    pub(crate) fn unread(&mut self) -> Result<Vec<u32>, Error> {
        self.search("UID SEARCH UNSEEN")
    }

    pub(crate) fn recent(&mut self) -> Result<Vec<u32>, Error> {
        self.search(&format!("UID SEARCH SINCE {}", recent_since()))
    }

    // Refresh mailbox state on polling servers (e.g. Coremail 163/126) that do
    // not surface new EXISTS updates during a bare UID SEARCH in selected state.
    pub(crate) fn noop(&mut self) -> Result<(), Error> {
        self.command("NOOP").map(|_| ())
    }

    fn search(&mut self, query: &str) -> Result<Vec<u32>, Error> {
        let mut unread = self
            .command(query)
            .map_err(|e| {
                if e == Error::Rejected {
                    Error::Search
                } else {
                    e
                }
            })?
            .unread
            .ok_or(Error::Protocol)?;
        if unread.contains(&0) {
            return Err(Error::Protocol);
        }
        unread.sort_unstable();
        unread.dedup();
        Ok(unread)
    }

    pub(crate) fn fetch(&mut self, uids: &[u32]) -> Result<Vec<Mail>, Error> {
        if uids.is_empty() {
            return Ok(Vec::new());
        }
        let set = uids
            .iter()
            .map(u32::to_string)
            .collect::<Vec<_>>()
            .join(",");
        let mut result = self
            .command(&format!("UID FETCH {set} (UID ENVELOPE)"))?
            .mail;
        result.retain(|mail| uids.contains(&mail.uid));
        Ok(result)
    }

    pub(crate) fn fetch_body(&mut self, uid: u32) -> Result<(String, String), Error> {
        if uid == 0 { return Err(Error::Protocol); }
        let structure = self.command(&format!("UID FETCH {uid} (UID BODYSTRUCTURE)"))?;
        let part = structure.parts.into_iter().find(|(id, _)| *id == uid)
            .and_then(|(_, part)| part).ok_or(Error::BodyUnavailable)?;
        if part.octets > 512 * 1024 { return Err(Error::BodyTooLarge); }
        let section = part.path.iter().map(u32::to_string).collect::<Vec<_>>().join(".");
        // Fetch the selected text part only, never attachments or the Seen flag.
        // QQ may stall on partial BODY fetches; the structure and frame bounds limit size.
        let reply = self.command(&format!("UID FETCH {uid} (UID BODY.PEEK[{section}])"))?;
        let expected = Some(SectionPath::Part(part.path.clone(), None));
        let bytes = reply.sections.into_iter().find(|(_, id, path, _)| *id == Some(uid) && *path == expected)
            .map(|(_, _, _, data)| data).ok_or(Error::BodyUnavailable)?;
        if bytes.len() != part.octets as usize { return Err(Error::Protocol); }
        Ok((decode_body(&bytes, &part.encoding, &part.charset)?, part.mime.into()))
    }

    pub(crate) fn fetch_inline_images(&mut self, uid: u32) -> Result<Vec<(String, String)>, Error> {
        use base64::{engine::general_purpose::STANDARD, Engine as _};
        if uid == 0 { return Err(Error::Protocol); }
        let structure = self.command(&format!("UID FETCH {uid} (UID BODYSTRUCTURE)"))?;
        let parts = structure.images.into_iter().find(|(id, _)| *id == uid).map(|(_, parts)| parts).unwrap_or_default();
        let mut images = Vec::new(); let mut total = 0usize;
        for part in parts {
            total += part.octets as usize;
            if total > 2 * 1024 * 1024 { break; }
            let section = part.path.iter().map(u32::to_string).collect::<Vec<_>>().join(".");
            let reply = self.command(&format!("UID FETCH {uid} (UID BODY.PEEK[{section}])"))?;
            let expected = Some(SectionPath::Part(part.path, None));
            let data = reply.sections.into_iter().find(|(_, id, path, _)| *id == Some(uid) && *path == expected)
                .map(|(_, _, _, data)| data).ok_or(Error::BodyUnavailable)?;
            if data.len() != part.octets as usize { return Err(Error::Protocol); }
            let bytes = STANDARD.decode(data.into_iter().filter(|b| !b.is_ascii_whitespace()).collect::<Vec<_>>()).map_err(|_| Error::BodyEncoding)?;
            let valid = match part.mime.as_str() {
                "image/png" => bytes.starts_with(b"\x89PNG\r\n\x1a\n"),
                "image/jpeg" => bytes.starts_with(&[0xff, 0xd8, 0xff]),
                "image/gif" => bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a"),
                "image/webp" => bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP"), _ => false,
            };
            if valid { images.push((part.cid, format!("data:{};base64,{}", part.mime, STANDARD.encode(bytes)))); }
        }
        Ok(images)
    }

    // IDLE uses the socket read timeout. On either timeout or a mailbox change,
    // send DONE and consume the matching completion before issuing another command.
    pub(crate) fn idle(&mut self) -> Result<bool, Error> {
        let tag = self.send("IDLE")?;
        loop {
            match self.read_frame(false).map_err(ReadError::public)? {
                Frame::Standard(Response::Continue { .. }) => break,
                Frame::Standard(Response::Done {
                    tag: received,
                    status: Status::Bad | Status::No,
                    ..
                }) if received.0 == tag => return Ok(false),
                Frame::Standard(response) => observe(response, &mut Reply::default())?,
                Frame::Id => return Err(Error::Protocol),
            }
        }
        match self.read_frame(false) {
            Ok(Frame::Standard(response)) => observe(response, &mut Reply::default())?,
            Err(ReadError::Timeout) => (),
            Ok(Frame::Id) => return Err(Error::Protocol),
            Err(error) => return Err(error.public()),
        }
        self.write(b"DONE\r\n")?;
        self.complete(&tag, false)?;
        Ok(true)
    }

    fn command(&mut self, command: &str) -> Result<Reply, Error> {
        let tag = self.send(command)?;
        self.complete(&tag, command == ID_COMMAND)
    }

    fn send(&mut self, command: &str) -> Result<String, Error> {
        self.next_tag = self.next_tag.checked_add(1).ok_or(Error::Protocol)?;
        let tag = format!("A{}", self.next_tag);
        self.write(format!("{tag} {command}\r\n").as_bytes())?;
        Ok(tag)
    }

    fn write(&mut self, bytes: &[u8]) -> Result<(), Error> {
        self.stream
            .get_mut()
            .write_all(bytes)
            .map_err(|_| Error::Transport)?;
        self.stream.get_mut().flush().map_err(|_| Error::Transport)
    }

    fn complete(&mut self, tag: &str, allow_id: bool) -> Result<Reply, Error> {
        let mut reply = Reply::default();
        loop {
            match self.read_frame(allow_id).map_err(ReadError::public)? {
                Frame::Id => (),
                Frame::Standard(Response::Done {
                    tag: received,
                    status,
                    ..
                }) if received.0 == tag => {
                    return match status {
                        Status::Ok => Ok(reply),
                        Status::No | Status::Bad => Err(Error::Rejected),
                        _ => Err(Error::Protocol),
                    };
                }
                Frame::Standard(response) => observe(response, &mut reply)?,
            }
        }
    }

    fn read_frame(&mut self, allow_id: bool) -> Result<Frame<'_>, ReadError> {
        self.frame.clear();
        loop {
            let start = self.frame.len();
            let count = (&mut self.stream)
                .take((MAX_FRAME - start + 1) as u64)
                .read_until(b'\n', &mut self.frame)
                .map_err(|error| ReadError::io(error, self.frame.is_empty()))?;
            if count == 0 {
                return Err(ReadError::Public(Error::Closed));
            }
            let line = &self.frame[start..];
            if self.frame.len() > MAX_FRAME || !line.ends_with(b"\r\n") {
                return Err(Error::Protocol.into());
            }
            let line = &line[..line.len() - 2];
            let may_have_literal = start != 0 || is_data_response(line, b"ID") || is_fetch(line);
            let Some(size) = may_have_literal.then(|| literal_at_end(line)).flatten() else {
                break;
            };
            let size = size?;
            let end = self
                .frame
                .len()
                .checked_add(size)
                .filter(|end| *end <= MAX_FRAME)
                .ok_or(Error::Protocol)?;
            let start = self.frame.len();
            self.frame.resize(end, 0);
            self.stream
                .read_exact(&mut self.frame[start..])
                .map_err(|e| ReadError::io(e, false))?;
        }
        if is_data_response(&self.frame, b"ID") {
            if !allow_id || !valid_id(&self.frame[4..self.frame.len() - 2]) {
                return Err(Error::Protocol.into());
            }
            return Ok(Frame::Id);
        }
        // Bound recursive BODYSTRUCTURE before parsing and exclude unused attributes:
        // INTERNALDATE NIL and invalid UTF-8 METADATA panic in the pinned parser.
        if is_data_response(&self.frame, b"METADATA")
            || (is_fetch(&self.frame) && !valid_fetch_shape(&self.frame))
        {
            return Err(Error::Protocol.into());
        }
        if let Some(response) = parse_control_response(&self.frame) {
            return response.map(Frame::Standard).map_err(Into::into);
        }
        match imap_proto::parse_response(&self.frame) {
            Ok(([], response)) => Ok(Frame::Standard(response)),
            _ => Err(Error::Protocol.into()),
        }
    }
}

impl Imap<native_tls::TlsStream<TcpStream>> {
    pub(crate) fn watch_idle(&mut self) -> Result<bool, Error> {
        self.stream.get_ref().get_ref().set_read_timeout(Some(Duration::from_secs(5)))
            .map_err(|_| Error::Transport)?;
        let result = self.idle();
        self.stream.get_ref().get_ref().set_read_timeout(Some(IO_TIMEOUT))
            .map_err(|_| Error::Transport)?;
        result
    }
}

pub(crate) fn connect_imap(host: &str) -> Result<Imap<native_tls::TlsStream<TcpStream>>, Error> {
    let addresses = (host, 993).to_socket_addrs().map_err(|_| Error::Dns)?;
    let tls = native_tls::TlsConnector::builder()
        .min_protocol_version(Some(native_tls::Protocol::Tlsv12))
        .build()
        .map_err(|_| Error::Tls)?;
    let mut error = Error::Connect;
    for address in addresses {
        match connect_tls(&tls, host, &address) {
            Ok(stream) => return Imap::new(stream),
            Err(Error::Connect) => continue,
            // Some 163 endpoints close the Schannel handshake when offered
            // TLS 1.3. Retry with TLS 1.2 and the same certificate validation.
            Err(Error::Tls) if host == "imap.163.com" => {
                let compatible = native_tls::TlsConnector::builder()
                    .min_protocol_version(Some(native_tls::Protocol::Tlsv12))
                    .max_protocol_version(Some(native_tls::Protocol::Tlsv12))
                    .build()
                    .map_err(|_| Error::Tls)?;
                if let Ok(stream) = connect_tls(&compatible, host, &address) {
                    return Imap::new(stream);
                }
                error = Error::Tls;
            }
            Err(failure) => error = failure,
        }
    }
    Err(error)
}

fn connect_tls(
    tls: &native_tls::TlsConnector,
    host: &str,
    address: &std::net::SocketAddr,
) -> Result<native_tls::TlsStream<TcpStream>, Error> {
    let stream =
        TcpStream::connect_timeout(address, Duration::from_secs(8)).map_err(|_| Error::Connect)?;
    stream
        .set_read_timeout(Some(IO_TIMEOUT))
        .map_err(|_| Error::Transport)?;
    stream
        .set_write_timeout(Some(IO_TIMEOUT))
        .map_err(|_| Error::Transport)?;
    tls.connect(host, stream).map_err(|_| Error::Tls)
}

// Status text is opaque and may contain private data. The pinned parser can
// slice it at a non-UTF-8 boundary after a response code, so parse its framing here.
fn parse_control_response(bytes: &[u8]) -> Option<Result<Response<'_>, Error>> {
    let line = bytes.strip_suffix(b"\r\n")?;
    if let Some(text) = line.strip_prefix(b"+") {
        return Some(if text.is_empty() || text.starts_with(b" ") {
            Ok(Response::Continue {
                code: None,
                information: None,
            })
        } else {
            Err(Error::Protocol)
        });
    }
    let mut words = line.splitn(3, |b| *b == b' ');
    let tag = words.next()?;
    let status = words.next()?;
    let status = [
        (b"OK".as_slice(), Status::Ok),
        (b"NO", Status::No),
        (b"BAD", Status::Bad),
        (b"BYE", Status::Bye),
        (b"PREAUTH", Status::PreAuth),
    ]
    .into_iter()
    .find_map(|(word, value)| status.eq_ignore_ascii_case(word).then_some(value))?;
    let text = words.next().unwrap_or_default();
    let code = match parse_status_code(text) {
        Ok(code) => code,
        Err(error) => return Some(Err(error)),
    };
    if tag == b"*" {
        return Some(Ok(Response::Data {
            status,
            code,
            information: None,
        }));
    }
    if tag.is_empty() || !tag.iter().all(u8::is_ascii_alphanumeric) {
        return Some(Err(Error::Protocol));
    }
    let tag = RequestId(String::from_utf8_lossy(tag).into_owned());
    Some(Ok(Response::Done {
        tag,
        status,
        code,
        information: None,
    }))
}

fn parse_status_code(text: &[u8]) -> Result<Option<ResponseCode<'_>>, Error> {
    let Some(code) = text.strip_prefix(b"[") else {
        return Ok(None);
    };
    let end = code
        .iter()
        .position(|byte| *byte == b']')
        .ok_or(Error::Protocol)?;
    if code.get(end + 1).is_some_and(|byte| *byte != b' ') {
        return Err(Error::Protocol);
    }
    let mut words = code[..end].splitn(2, |byte| *byte == b' ');
    if !words
        .next()
        .is_some_and(|name| name.eq_ignore_ascii_case(b"UIDVALIDITY"))
    {
        return Ok(None);
    }
    let value = words
        .next()
        .and_then(|value| std::str::from_utf8(value).ok())
        .and_then(|value| value.parse().ok())
        .filter(|value| *value != 0)
        .ok_or(Error::Protocol)?;
    Ok(Some(ResponseCode::UidValidity(value)))
}

fn observe(response: Response<'_>, reply: &mut Reply) -> Result<(), Error> {
    match response {
        Response::Data {
            status: Status::Ok,
            code: Some(ResponseCode::UidValidity(uid)),
            ..
        } if uid != 0 => reply.uid_validity = Some(uid),
        Response::Data {
            status: Status::Ok | Status::No,
            ..
        }
        | Response::MailboxData(
            MailboxDatum::Exists(_) | MailboxDatum::Recent(_) | MailboxDatum::Flags(_),
        )
        | Response::Expunge(_) => (),
        Response::Data {
            status: Status::Bye,
            ..
        } => return Err(Error::Closed),
        Response::Capabilities(caps) => {
            reply.supports_idle = Some(caps.iter().any(
                |cap| matches!(cap, Capability::Atom(atom) if atom.eq_ignore_ascii_case("IDLE")),
            ))
        }
        Response::IDs(ids) => reply.unread = Some(ids),
        Response::Fetch(sequence, attrs) => {
            let mut uid = None;
            let mut envelope = None;
            let mut part = None;
            let mut images = Vec::new();
            let mut sections = Vec::new();
            for attr in attrs {
                match attr {
                    AttributeValue::Uid(value) => uid = Some(value),
                    AttributeValue::Envelope(value) => envelope = Some(value),
                    AttributeValue::BodyStructure(body) => { part = Some(text_part(&body, Vec::new())); image_parts(&body, Vec::new(), &mut images); },
                    AttributeValue::BodySection { section, index: None, data: Some(data) } => sections.push((section, data.to_vec())),
                    _ => (),
                }
            }
            if !images.is_empty() { reply.images.push((uid.filter(|uid| *uid != 0).ok_or(Error::Protocol)?, images)); }
            if let Some(part) = part {
                reply.parts.push((uid.filter(|uid| *uid != 0).ok_or(Error::Protocol)?, part));
            }
            // A continuation can omit UID, but must use a sequence explicitly
            // associated with that UID earlier in this command.
            if let Some(uid) = uid {
                if uid == 0 { return Err(Error::Protocol); }
                for (seq, previous_uid, _, _) in &mut reply.sections {
                    if *seq == sequence {
                        if previous_uid.is_some_and(|previous| previous != uid) { return Err(Error::Protocol); }
                        *previous_uid = Some(uid);
                    }
                }
            }
            let resolved_uid = uid.or_else(|| reply.sections.iter().find(|(seq, id, _, _)| *seq == sequence && id.is_some()).and_then(|(_, id, _, _)| *id));
            if sections.is_empty() && uid.is_some() {
                reply.sections.push((sequence, uid, None, Vec::new()));
            }
            for (path, bytes) in sections { reply.sections.push((sequence, resolved_uid, path, bytes)); }
            if let Some(envelope) = envelope {
                reply.mail.push(extract(
                    uid.filter(|uid| *uid != 0).ok_or(Error::Protocol)?,
                    &envelope,
                ));
            }
        }
        _ => return Err(Error::Protocol),
    }
    Ok(())
}

#[derive(Debug)]
enum ReadError {
    Timeout,
    Public(Error),
}

impl From<Error> for ReadError {
    fn from(error: Error) -> Self {
        Self::Public(error)
    }
}

impl ReadError {
    fn io(error: io::Error, empty: bool) -> Self {
        match error.kind() {
            io::ErrorKind::WouldBlock | io::ErrorKind::TimedOut if empty => Self::Timeout,
            io::ErrorKind::UnexpectedEof => Self::Public(Error::Closed),
            _ => Self::Public(Error::Transport),
        }
    }

    fn public(self) -> Error {
        match self {
            Self::Timeout => Error::Transport,
            Self::Public(error) => error,
        }
    }
}

fn quote(input: &str) -> Result<String, Error> {
    if input.chars().any(char::is_control) {
        return Err(Error::InvalidCredential);
    }
    Ok(format!(
        "\"{}\"",
        input.replace('\\', "\\\\").replace('"', "\\\"")
    ))
}

fn is_data_response(bytes: &[u8], kind: &[u8]) -> bool {
    bytes
        .strip_prefix(b"* ")
        .and_then(|rest| rest.split(|b| b.is_ascii_whitespace()).next())
        .is_some_and(|word| word.eq_ignore_ascii_case(kind))
}

fn is_fetch(bytes: &[u8]) -> bool {
    let Some(rest) = bytes.strip_prefix(b"* ") else {
        return false;
    };
    let mut words = rest.split(|b| *b == b' ');
    matches!((words.next(), words.next()), (Some(seq), Some(kind))
        if !seq.is_empty() && seq.iter().all(u8::is_ascii_digit) && kind.eq_ignore_ascii_case(b"FETCH"))
}

fn literal_at_end(line: &[u8]) -> Option<Result<usize, Error>> {
    let marker = line.iter().rposition(|byte| *byte == b'{')?;
    let digits = line.get(marker + 1..)?.strip_suffix(b"}")?;
    if digits.is_empty() || !digits.iter().all(u8::is_ascii_digit) {
        return None;
    }
    let before = marker;
    if before == 0 || !matches!(line[before - 1], b' ' | b'(') {
        return None;
    }
    Some(
        std::str::from_utf8(digits)
            .ok()
            .and_then(|s| s.parse().ok())
            .ok_or(Error::Protocol),
    )
}

fn take_string(input: &[u8]) -> Option<&[u8]> {
    match input.first()? {
        b'"' => {
            let mut escaped = false;
            for (i, byte) in input.iter().copied().enumerate().skip(1) {
                match (escaped, byte) {
                    (_, b'\0' | b'\r' | b'\n') => return None,
                    (true, b'"' | b'\\') => escaped = false,
                    (true, _) => return None,
                    (false, b'\\') => escaped = true,
                    (false, b'"') => return Some(&input[i + 1..]),
                    _ => (),
                }
            }
            None
        }
        b'{' => {
            let end = input.iter().position(|b| *b == b'}')?;
            let digits = std::str::from_utf8(&input[1..end]).ok()?;
            if digits.is_empty() || !digits.bytes().all(|b| b.is_ascii_digit()) {
                return None;
            }
            let size = digits.parse().ok()?;
            let literal = input.get(end + 1..)?.strip_prefix(b"\r\n")?;
            literal.get(size..)
        }
        _ => None,
    }
}

fn valid_id(input: &[u8]) -> bool {
    let Some(input) = input.strip_prefix(b" ") else {
        return false;
    };
    if input.eq_ignore_ascii_case(b"NIL") {
        return true;
    }
    let Some(mut rest) = input.strip_prefix(b"(") else {
        return false;
    };
    if rest == b")" {
        return true;
    }
    loop {
        let Some(value) = take_string(rest).and_then(|s| s.strip_prefix(b" ")) else {
            return false;
        };
        let Some(next) = take_string(value).or_else(|| {
            value
                .get(3..)
                .filter(|_| value[..3].eq_ignore_ascii_case(b"NIL"))
        }) else {
            return false;
        };
        if next == b")" {
            return true;
        }
        let Some(next) = next.strip_prefix(b" ") else {
            return false;
        };
        rest = next;
    }
}

fn valid_fetch_shape(bytes: &[u8]) -> bool {
    let Some(mut rest) = bytes
        .splitn(4, |byte| *byte == b' ')
        .nth(3)
        .and_then(|s| s.strip_prefix(b"("))
    else {
        return false;
    };
    let mut depth = 1;
    let mut expect_attribute = true;
    while let Some(&byte) = rest.first() {
        if expect_attribute {
            let Some(space) = rest.iter().position(|b| *b == b' ') else {
                return false;
            };
            let name = &rest[..space];
            let body_section = name.get(..5).is_some_and(|prefix| prefix.eq_ignore_ascii_case(b"BODY[")) && name.ends_with(b"]")
                && name[5..name.len()-1].iter().all(|b| b.is_ascii_digit() || *b == b'.');
            if !body_section && ![b"UID".as_slice(), b"ENVELOPE", b"FLAGS", b"MODSEQ", b"BODYSTRUCTURE"]
                .iter()
                .any(|name| rest[..space].eq_ignore_ascii_case(name))
            {
                return false;
            }
            expect_attribute = false;
            rest = &rest[space + 1..];
            continue;
        }
        match byte {
            b'"' | b'{' => {
                let Some(next) = take_string(rest) else {
                    return false;
                };
                rest = next;
                continue;
            }
            b'(' => {
                depth += 1;
                if depth > 16 {
                    return false;
                }
            }
            b')' => {
                depth -= 1;
                if depth == 0 {
                    return &rest[1..] == b"\r\n";
                }
            }
            b' ' if depth == 1 => expect_attribute = true,
            b'\r' | b'\n' => return false,
            _ => (),
        }
        rest = &rest[1..];
    }
    false
}

fn extract(uid: u32, envelope: &Envelope<'_>) -> Mail {
    let subject = envelope
        .subject
        .map(decode_mime_header)
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "(无主题)".into());
    let from = envelope
        .from
        .as_ref()
        .and_then(|list| list.first())
        .and_then(|addr| {
            if let Some(name) = addr
                .name
                .map(decode_mime_header)
                .filter(|s| !s.trim().is_empty())
            {
                return Some(name);
            }
            Some(format!(
                "{}@{}",
                String::from_utf8_lossy(addr.mailbox?),
                String::from_utf8_lossy(addr.host?)
            ))
        })
        .unwrap_or_else(|| "未知发件人".into());
    let date = envelope
        .date
        .map(|date| String::from_utf8_lossy(date).trim().to_owned())
        .unwrap_or_default();
    Mail {
        uid,
        from,
        subject,
        date,
    }
}

fn decode_body(data: &[u8], transfer: &str, charset: &str) -> Result<String, Error> {
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    let bytes = match transfer {
        "base64" => STANDARD.decode(data.iter().copied().filter(|b| !b.is_ascii_whitespace()).collect::<Vec<_>>())
            .map_err(|_| Error::BodyEncoding)?,
        "quoted-printable" => {
            let mut out = Vec::new();
            let mut i = 0;
            while i < data.len() {
                if data[i] != b'=' { out.push(data[i]); i += 1; continue; }
                if data.get(i + 1..i + 3) == Some(b"\r\n") { i += 3; continue; }
                let high = data.get(i + 1).and_then(|b| (*b as char).to_digit(16)).ok_or(Error::BodyEncoding)?;
                let low = data.get(i + 2).and_then(|b| (*b as char).to_digit(16)).ok_or(Error::BodyEncoding)?;
                out.push((high * 16 + low) as u8);
                i += 3;
            }
            out
        },
        "7bit" | "8bit" | "binary" => data.to_vec(),
        _ => return Err(Error::BodyEncoding),
    };
    let encoding = encoding_rs::Encoding::for_label(charset.as_bytes()).ok_or(Error::BodyEncoding)?;
    let (decoded, _, invalid) = encoding.decode(&bytes);
    if invalid { return Err(Error::BodyEncoding); }
    Ok(decoded.into_owned())
}

fn decode_q_header(data: &[u8]) -> Option<Vec<u8>> {
    let mut output = Vec::with_capacity(data.len());
    let mut bytes = data.iter().copied();
    while let Some(byte) = bytes.next() {
        match byte {
            b'_' => output.push(b' '),
            b'=' => {
                let high = (bytes.next()? as char).to_digit(16)?;
                let low = (bytes.next()? as char).to_digit(16)?;
                output.push((high * 16 + low) as u8);
            }
            b'!'..=b'~' if byte != b'?' => output.push(byte),
            _ => return None,
        }
    }
    Some(output)
}

fn decode_word(word: &str) -> Option<(String, usize)> {
    use base64::{engine::general_purpose::STANDARD, Engine as _};

    let (charset, rest) = word.strip_prefix("=?")?.split_once('?')?;
    let (encoding, rest) = rest.split_once('?')?;
    let (data, _) = rest.split_once("?=")?;
    let bytes = if encoding.eq_ignore_ascii_case("B") {
        STANDARD.decode(data).ok()?
    } else if encoding.eq_ignore_ascii_case("Q") {
        decode_q_header(data.as_bytes())?
    } else {
        return None;
    };
    let charset = charset.split('*').next()?;
    let charset = encoding_rs::Encoding::for_label(charset.as_bytes())?;
    let (decoded, _, _) = charset.decode(&bytes);
    let consumed = word.len() - rest.len() + data.len() + 2;
    Some((decoded.into_owned(), consumed))
}

pub(crate) fn decode_mime_header(raw: &[u8]) -> String {
    let input = String::from_utf8_lossy(raw);
    let mut output = String::new();
    let mut remainder = input.as_ref();
    let mut previous_word = false;
    while let Some(start) = remainder.find("=?") {
        let (between, token) = remainder.split_at(start);
        if let Some((decoded, consumed)) = decode_word(token) {
            if !previous_word
                || !between
                    .bytes()
                    .all(|b| matches!(b, b' ' | b'\t' | b'\r' | b'\n'))
            {
                output.push_str(between);
            }
            output.push_str(&decoded);
            remainder = &token[consumed..];
            previous_word = true;
        } else {
            output.push_str(between);
            output.push_str("=?");
            remainder = &token[2..];
            previous_word = false;
        }
    }
    output.push_str(remainder);
    output
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Default)]
    struct Replay<'a> {
        incoming: &'a [u8],
        written: Vec<u8>,
        timeout_when_empty: bool,
    }

    impl Read for Replay<'_> {
        fn read(&mut self, output: &mut [u8]) -> io::Result<usize> {
            if self.incoming.is_empty() && self.timeout_when_empty {
                return Err(io::ErrorKind::TimedOut.into());
            }
            self.incoming.read(output)
        }
    }

    impl Write for Replay<'_> {
        fn write(&mut self, input: &[u8]) -> io::Result<usize> {
            self.written.write(input)
        }
        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    fn replay(input: &[u8]) -> Imap<Replay<'_>> {
        Imap::new(Replay {
            incoming: input,
            ..Default::default()
        })
        .unwrap()
    }


    fn body_fixture(structure: &str, response: &str) -> String {
        format!("* OK ready\r\n* 1 FETCH (UID 42 BODYSTRUCTURE {structure})\r\nA1 OK done\r\n{response}A2 OK done\r\n")
    }

    #[test]
    fn reader_inline_images_are_bounded_raster_and_read_only() {
        let structure = r#"(("IMAGE" "PNG" NIL "<logo>" NIL "BASE64" 12)("IMAGE" "SVG+XML" NIL "<bad>" NIL "BASE64" 12)("IMAGE" "JPEG" NIL "<huge>" NIL "BASE64" 999999) "RELATED")"#;
        let frame = body_fixture(structure, "* 1 FETCH (UID 42 BODY[1] {12}\r\niVBORw0KGgo=)\r\n");
        let mut client = replay(frame.as_bytes());
        assert_eq!(client.fetch_inline_images(42).unwrap(), vec![("logo".into(), "data:image/png;base64,iVBORw0KGgo=".into())]);
        assert_eq!(String::from_utf8(client.stream.into_inner().written).unwrap(), "A1 UID FETCH 42 (UID BODYSTRUCTURE)\r\nA2 UID FETCH 42 (UID BODY.PEEK[1])\r\n");
    }

    #[test]
    fn reader_selects_html_skips_attachments_and_only_uses_peek() {
        // Synthetic multipart alternative plus a text attachment: no personal mail.
        let frame = body_fixture(
            r#"(("TEXT" "PLAIN" ("CHARSET" "UTF-8") NIL NIL "7BIT" 5 1)("TEXT" "HTML" ("CHARSET" "UTF-8") NIL NIL "8BIT" 9 1)("TEXT" "HTML" ("CHARSET" "UTF-8" "NAME" "secret.html") NIL NIL "8BIT" 900000 1) "MIXED")"#,
            "* 1 FETCH (BODY[2] {9}\r\n<p>Hi</p> UID 42)\r\n",
        );
        let mut client = replay(frame.as_bytes());
        assert_eq!(client.fetch_body(42).unwrap(), ("<p>Hi</p>".into(), "text/html".into()));
        assert_eq!(String::from_utf8(client.stream.into_inner().written).unwrap(),
            "A1 UID FETCH 42 (UID BODYSTRUCTURE)\r\nA2 UID FETCH 42 (UID BODY.PEEK[2])\r\n");
    }

    #[test]
    fn reader_matches_split_uid_before_or_after_body_by_sequence() {
        for response in [
            "* 1 FETCH (UID 42)\r\n* 1 FETCH (BODY[1] {5}\r\nhello)\r\n",
            "* 1 FETCH (BODY[1] {5}\r\nhello)\r\n* 1 FETCH (UID 42)\r\n",
        ] {
            let frame = body_fixture(r#"("TEXT" "PLAIN" ("CHARSET" "UTF-8") NIL NIL "7BIT" 5 1)"#, response);
            assert_eq!(replay(frame.as_bytes()).fetch_body(42).unwrap(), ("hello".into(), "text/plain".into()));
        }
    }

    #[test]
    fn reader_rejects_wrong_uid_section_length_and_missing_body() {
        let structure = r#"("TEXT" "PLAIN" ("CHARSET" "UTF-8") NIL NIL "7BIT" 5 1)"#;
        for response in [
            "* 1 FETCH (UID 99 BODY[1] {5}\r\nhello)\r\n",
            "* 1 FETCH (UID 42 BODY[2] {5}\r\nhello)\r\n",
            "* 2 FETCH (UID 42)\r\n* 1 FETCH (BODY[1] {5}\r\nhello)\r\n",
            "* 1 FETCH (UID 42 BODY[1] NIL)\r\n",
        ] {
            assert_eq!(replay(body_fixture(structure, response).as_bytes()).fetch_body(42), Err(Error::BodyUnavailable));
        }
        assert_eq!(replay(body_fixture(structure, "* 1 FETCH (UID 42 BODY[1] {4}\r\noops)\r\n").as_bytes()).fetch_body(42), Err(Error::Protocol));
        assert_eq!(replay(body_fixture(structure, "* 1 FETCH (UID 42)\r\n* 1 FETCH (UID 99 BODY[1] {5}\r\nhello)\r\n").as_bytes()).fetch_body(42), Err(Error::Protocol));
    }

    #[test]
    fn reader_refuses_large_bodies_attachments_and_recursive_structures() {
        for (structure, error) in [
            (r#"("TEXT" "HTML" ("CHARSET" "UTF-8") NIL NIL "8BIT" 524289 1)"#, Error::BodyTooLarge),
            (r#"("TEXT" "HTML" ("NAME" "attachment.html") NIL NIL "8BIT" 5 1)"#, Error::BodyUnavailable),
            (r#"("TEXT" "HTML" ("NAME*" "utf-8''attachment.html") NIL NIL "8BIT" 5 1)"#, Error::BodyUnavailable),
            (r#"("TEXT" "PLAIN" NIL NIL NIL "7BIT" 5 1 NIL ("ATTACHMENT" ("FILENAME" "a.txt")))"#, Error::BodyUnavailable),
        ] {
            let frame = body_fixture(structure, "");
            let mut client = replay(frame.as_bytes());
            assert_eq!(client.fetch_body(42), Err(error));
            assert!(!String::from_utf8(client.stream.into_inner().written).unwrap().contains("PEEK"));
        }
        let deep = format!("{}\"TEXT\"{}", "(".repeat(18), ")".repeat(18));
        assert_eq!(replay(body_fixture(&deep, "").as_bytes()).fetch_body(42), Err(Error::Protocol));
    }

    #[test]
    fn reader_decodes_transfer_and_charset_without_header_underscore_rules() {
        assert_eq!(decode_body(b"5Lit\r\n5paH", "base64", "utf-8").unwrap(), "中文");
        assert_eq!(decode_body(b"=D6=D0=CE=C4_\r\nsoft=\r\nline", "quoted-printable", "gb18030").unwrap(), "中文_\r\nsoftline");
        for (bytes, transfer, charset) in [
            (b"bad!".as_slice(), "base64", "utf-8"),
            (b"=", "quoted-printable", "utf-8"),
            (b"=GG", "quoted-printable", "utf-8"),
            (b"\xff", "8bit", "utf-8"),
            (b"abc", "8bit", "unknown"),
        ] { assert_eq!(decode_body(bytes, transfer, charset), Err(Error::BodyEncoding)); }
    }

    #[test]
    fn maps_fixed_hosts_and_accepts_only_custom_hostnames() {
        for (provider, host) in [
            ("qq", "imap.qq.com"),
            ("163", "imap.163.com"),
            ("126", "imap.126.com"),
            ("gmail", "imap.gmail.com"),
            ("outlook", "outlook.office365.com"),
            ("custom", "imap.example.invalid"),
        ] {
            assert_eq!(
                email_imap_host(provider, " Imap.Example.Invalid ").as_deref(),
                Some(host)
            );
        }
        for invalid in [
            "",
            "https://host",
            "host:993",
            "user@host",
            "-bad.host",
            "bad..host",
            "a b",
        ] {
            assert_eq!(email_imap_host("custom", invalid), None);
        }
        assert_eq!(email_imap_host("unknown", "imap.example.invalid"), None);
    }

    #[test]
    fn mime_words_keep_plain_spacing_and_malformed_input() {
        assert_eq!(
            decode_mime_header(b"Re: =?UTF-8?Q?=E4=B8=AD?= \t\r\n =?utf-8?B?5paH?= tail"),
            "Re: 中文 tail"
        );
        assert_eq!(decode_mime_header(b"=?gb18030?B?1tDOxA==?="), "中文");
        assert_eq!(
            decode_mime_header("=?UTF-8?Q?=中?= and =?UTF-8?Q?plain_text?=".as_bytes()),
            "=?UTF-8?Q?=中?= and plain text"
        );
        assert_eq!(
            decode_mime_header(b"=?unknown?B?YQ==?= and =?UTF-8?B?bad!"),
            "=?unknown?B?YQ==?= and =?UTF-8?B?bad!"
        );
    }

    #[test]
    fn only_valid_top_level_id_is_filtered_and_literals_keep_their_contents() {
        let mut client = replay(
            b"* OK ready\r\n* iD (\"name\" \"Coremail\" \"extension\" NIL)\r\nA1 OK done\r\n",
        );
        assert!(client.command(ID_COMMAND).is_ok());
        let mut client = replay(b"* OK ready\r\n* ID (broken)\r\nA1 OK done\r\n");
        assert_eq!(client.command(ID_COMMAND).err(), Some(Error::Protocol));
        let mut client = replay(b"* OK ready\r\n* ID NIL\r\nA1 OK done\r\n");
        assert_eq!(client.unread().err(), Some(Error::Protocol));
        let mut client = replay(b"* OK ready\r\n* 1 FETCH (UID 1 ENVELOPE (NIL {10}\r\n* ID NIL\r\n NIL NIL NIL NIL NIL NIL NIL NIL))\r\nA1 OK done\r\n");
        assert_eq!(client.fetch(&[1]).unwrap()[0].subject, "* ID NIL\r\n");
    }

    #[test]
    fn replay_recorded_163_capability_and_id_before_login() {
        let mut client = replay(include_bytes!("testdata/imap-163-public.imap"));
        assert!(!client.supports_idle().unwrap());
        assert!(client.command(ID_COMMAND).is_ok());
    }

    #[test]
    fn errors_are_typed_and_never_repeat_server_text() {
        for provider in ["qq", "163", "126", "gmail", "outlook", "custom"] {
            for status in ["NO", "BAD"] {
                let frame =
                    format!("* OK ready\r\nA1 {status} [AUTHENTICATIONFAILED] secret-marker\r\n");
                let error = replay(frame.as_bytes())
                    .open_inbox(provider, "test", "test")
                    .unwrap_err();
                assert_eq!(error, Error::Authentication);
                assert!(!error.message(provider).contains("secret-marker"));
            }
        }
        assert!(Error::Authentication.message("qq").contains("已失效"));
        assert!(Error::Authentication
            .message("gmail")
            .contains("应用专用密码"));
        assert!(Error::Authentication.message("outlook").contains("OAuth2"));
        assert!(Error::Tls.message("custom").contains("服务器证书"));
        assert_eq!(
            replay(b"* OK ready\r\nA1 NO unavailable\r\n").unread(),
            Err(Error::Search)
        );
        assert_eq!(
            replay(b"* OK ready\r\nA1 OK missing search data\r\n").unread(),
            Err(Error::Protocol)
        );
    }

    #[test]
    fn rejects_malformed_unknown_and_mismatched_responses() {
        for frame in [
            &b"Z9 OK wrong tag\r\n"[..],
            b"* UNKNOWN test\r\n",
            b"* 1 FETCH (INTERNALDATE NIL)\r\n",
            b"* METADATA INBOX (/shared/comment \"\xff\")\r\n",
            b"* SEARCH 42949672960\r\n",
            b"* 2 FETCH (UID 2 ENVELOPE (NIL {9999999}\r\n",
            b"* SEARCH 1\n",
            "* OK [UIDVALIDITY 1]中文\r\n".as_bytes(),
        ] {
            let input = [b"* OK ready\r\n", frame].concat();
            assert_eq!(replay(&input).unread(), Err(Error::Protocol));
        }
        assert_eq!(
            replay(b"* OK ready\r\n* BYE going away\r\n").unread(),
            Err(Error::Closed)
        );
        assert_eq!(
            replay(b"* OK ready\r\nA1 OK unexpectedly complete\r\n").idle(),
            Err(Error::Protocol)
        );
    }

    #[test]
    fn replay_idle_delivery_decodes_headers_and_suppresses_duplicate_uid() {
        let mut client = replay(include_bytes!("testdata/imap-idle.imap"));
        let mut cursor = MailboxCursor::default();
        let validity = client.open_inbox("qq", "fixture", "fake").unwrap();
        assert_eq!(validity, 987);
        assert!(client.supports_idle().unwrap());
        for uid in cursor.pending(validity, client.unread().unwrap()) { cursor.mark_seen(uid); }
        assert!(client.idle().unwrap());
        let pending = cursor.pending(validity, client.unread().unwrap());
        assert_eq!(pending, [43]);
        let mail = client.fetch(&pending).unwrap();
        assert_eq!(
            (mail[0].uid, mail[0].from.as_str(), mail[0].subject.as_str()),
            (43, "测试", "中文")
        );
        cursor.mark_seen(mail[0].uid);
        assert!(cursor.pending(validity, client.unread().unwrap()).is_empty());
        let written = String::from_utf8(client.stream.into_inner().written).unwrap();
        assert!(written.contains("A6 IDLE\r\nDONE\r\nA7 UID SEARCH UNSEEN"));
        assert!(written.contains("A8 UID FETCH 43 (UID ENVELOPE)"));
    }

    #[test]
    fn recent_search_includes_read_mail_and_requests_a_date_window() {
        let mut client = replay(b"* OK ready\r\n* SEARCH 20 10 20\r\nA1 OK done\r\n");
        assert_eq!(client.recent().unwrap(), [10, 20]);
        let written = String::from_utf8(client.stream.into_inner().written).unwrap();
        assert!(written.starts_with("A1 UID SEARCH SINCE "));
        assert!(!written.contains("UNSEEN"));
    }

    #[test]
    fn history_retry_unordered_and_duplicate_delivery() {
        let mut cursor = MailboxCursor::default();
        assert_eq!(cursor.pending(1, vec![20, 10]), [10, 20]);
        // Failed fetch must not consume either message.
        assert_eq!(cursor.pending(1, vec![10, 20]), [10, 20]);
        cursor.mark_seen(20);
        assert_eq!(cursor.pending(1, vec![20, 10]), [10]);
        cursor.mark_seen(10);
        assert!(cursor.pending(1, vec![10, 20]).is_empty());
        assert_eq!(cursor.pending(2, vec![1]), [1]);
        let mut cursor = MailboxCursor::default();
        assert_eq!(cursor.pending(1, (1..=100).collect()), (51..=100).collect::<Vec<_>>());
        assert_eq!(imap_date(0), "01-Jan-1970");
        assert_eq!(imap_date(19782), "29-Feb-2024");
    }

    #[test]
    fn replay_poll_delivery_and_explicit_idle_refusal() {
        let mut client = replay(include_bytes!("testdata/imap-poll.imap"));
        let mut cursor = MailboxCursor::default();
        let validity = client.open_inbox("163", "fixture", "fake").unwrap();
        assert!(!client.supports_idle().unwrap());
        assert!(!cursor.is_baseline_done(validity));
        for uid in cursor.pending(validity, client.unread().unwrap()) { cursor.mark_seen(uid); }
        cursor.mark_baseline_done(validity);
        assert!(cursor.is_baseline_done(validity));
        let pending = cursor.pending(validity, client.unread().unwrap());
        assert_eq!(client.fetch(&pending).unwrap()[0].subject, "poll fixture");
        assert_eq!(cursor.pending(validity + 1, vec![1]), [1]);
        assert!(!cursor.is_baseline_done(validity + 1));
        let mut client =
            replay(b"* OK ready\r\nA1 BAD unsupported\r\n* SEARCH 1\r\nA2 OK done\r\n");
        assert!(!client.idle().unwrap());
        assert_eq!(client.unread().unwrap(), [1]);
    }

    #[test]
    fn poll_noop_refreshes_mailbox_updates_before_search() {
        let mut client = replay(b"* OK ready\r\n* 4 EXISTS\r\n* 1 RECENT\r\nA1 OK NOOP completed\r\n* SEARCH 101 102\r\nA2 OK SEARCH completed\r\n");
        client.noop().unwrap();
        assert_eq!(client.unread().unwrap(), [101, 102]);
        let written = String::from_utf8(client.stream.into_inner().written).unwrap();
        assert_eq!(written, "A1 NOOP\r\nA2 UID SEARCH UNSEEN\r\n");
    }
}
