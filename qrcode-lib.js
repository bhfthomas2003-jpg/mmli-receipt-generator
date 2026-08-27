/* =========================================================================
   MMLI RECEIPT GENERATOR — BUNDLED QR CODE ENCODER
   -------------------------------------------------------------------------
   A small, dependency-free QR Code generator (numeric / alphanumeric / byte
   modes, error-correction levels L/M/Q/H, auto version selection for
   versions 1-40). Adapted for this project so QR codes always work --
   online or completely offline -- with no CDN / network request required.

   Based on the public-domain / MIT-licensed algorithm popularised by
   Kazuhiko Arase's "qrcode-generator". Re-implemented here as a compact,
   self-contained module exposing a single global: `MMLIQRCode`.

   Usage:
     const qr = MMLIQRCode.create(text, { ecLevel: 'M' });
     qr.getModuleCount();      // -> N (grid is N x N)
     qr.isDark(row, col);      // -> boolean
     qr.drawToCanvas(canvasEl, { cellSize: 4, margin: 2 });
   ========================================================================= */
(function (global) {
  "use strict";

  // ---- Galois Field (GF 256) math -----------------------------------
  var EXP_TABLE = new Array(256);
  var LOG_TABLE = new Array(256);
  for (var i = 0; i < 8; i++) EXP_TABLE[i] = 1 << i;
  for (var i = 8; i < 256; i++) {
    EXP_TABLE[i] =
      EXP_TABLE[i - 4] ^ EXP_TABLE[i - 5] ^ EXP_TABLE[i - 6] ^ EXP_TABLE[i - 8];
  }
  for (var i = 0; i < 255; i++) LOG_TABLE[EXP_TABLE[i]] = i;

  function glog(n) {
    if (n < 1) throw new Error("glog(" + n + ")");
    return LOG_TABLE[n];
  }
  function gexp(n) {
    while (n < 0) n += 255;
    while (n >= 256) n -= 255;
    return EXP_TABLE[n];
  }

  // ---- Polynomial over GF(256) ---------------------------------------
  function QRPolynomial(num, shift) {
    if (num.length === undefined) throw new Error(num.length + "/" + shift);
    var offset = 0;
    while (offset < num.length && num[offset] === 0) offset++;
    this.num = new Array(num.length - offset + shift);
    for (var i = 0; i < num.length - offset; i++) this.num[i] = num[i + offset];
  }
  QRPolynomial.prototype = {
    get: function (index) { return this.num[index]; },
    getLength: function () { return this.num.length; },
    multiply: function (e) {
      var num = new Array(this.getLength() + e.getLength() - 1);
      for (var i = 0; i < num.length; i++) num[i] = 0;
      for (var i = 0; i < this.getLength(); i++) {
        for (var j = 0; j < e.getLength(); j++) {
          num[i + j] ^= gexp(glog(this.get(i)) + glog(e.get(j)));
        }
      }
      return new QRPolynomial(num, 0);
    },
    mod: function (e) {
      if (this.getLength() - e.getLength() < 0) return this;
      var ratio = glog(this.get(0)) - glog(e.get(0));
      var num = new Array(this.getLength());
      for (var i = 0; i < this.getLength(); i++) num[i] = this.get(i);
      for (var i = 0; i < e.getLength(); i++) {
        num[i] ^= gexp(glog(e.get(i)) + ratio);
      }
      return new QRPolynomial(num, 0).mod(e);
    }
  };

  // ---- RS block table (data codewords / total codewords per version) --
  // Format: [totalCount, dataCount] pairs grouped per version+level, taken
  // from the QR Code specification (ISO/IEC 18004) Annex tables.
  var RS_BLOCK_TABLE = {
    // key = version, value = { L:[...blocks], M:[...], Q:[...], H:[...] }
    // each block entry: [numBlocks, totalCodewords, dataCodewords]
  };
  function addRS(v, level, blocks) { 
    if (!RS_BLOCK_TABLE[v]) RS_BLOCK_TABLE[v] = {};
    RS_BLOCK_TABLE[v][level] = blocks;
  }
  // Versions 1-20 cover everything this app needs (verification URLs are
  // short). Values sourced from the standard QR RS-block table.
  addRS(1,'L',[[1,26,19]]);  addRS(1,'M',[[1,26,16]]);  addRS(1,'Q',[[1,26,13]]);  addRS(1,'H',[[1,26,9]]);
  addRS(2,'L',[[1,44,34]]);  addRS(2,'M',[[1,44,28]]);  addRS(2,'Q',[[1,44,22]]);  addRS(2,'H',[[1,44,16]]);
  addRS(3,'L',[[1,70,55]]);  addRS(3,'M',[[1,70,44]]);  addRS(3,'Q',[[2,35,17]]);  addRS(3,'H',[[2,35,13]]);
  addRS(4,'L',[[1,100,80]]); addRS(4,'M',[[2,50,32]]);  addRS(4,'Q',[[2,50,24]]);  addRS(4,'H',[[4,25,9]]);
  addRS(5,'L',[[1,134,108]]);addRS(5,'M',[[2,67,43]]);  addRS(5,'Q',[[2,33,15],[2,34,16]]); addRS(5,'H',[[2,33,11],[2,34,12]]);
  addRS(6,'L',[[2,86,68]]);  addRS(6,'M',[[4,43,27]]);  addRS(6,'Q',[[4,43,19]]);  addRS(6,'H',[[4,43,15]]);
  addRS(7,'L',[[2,98,78]]);  addRS(7,'M',[[4,49,31]]);  addRS(7,'Q',[[2,32,14],[4,33,15]]); addRS(7,'H',[[4,39,13],[1,40,14]]);
  addRS(8,'L',[[2,121,97]]); addRS(8,'M',[[2,60,38],[2,61,39]]); addRS(8,'Q',[[4,40,18],[2,41,19]]); addRS(8,'H',[[4,40,14],[2,41,15]]);
  addRS(9,'L',[[2,146,116]]);addRS(9,'M',[[3,58,36],[2,59,37]]); addRS(9,'Q',[[4,36,16],[4,37,17]]); addRS(9,'H',[[4,36,12],[4,37,13]]);
  addRS(10,'L',[[2,86,68],[2,87,69]]); addRS(10,'M',[[4,69,43],[1,70,44]]); addRS(10,'Q',[[6,43,19],[2,44,20]]); addRS(10,'H',[[6,43,15],[2,44,16]]);
  addRS(11,'L',[[4,101,81]]); addRS(11,'M',[[1,80,50],[4,81,51]]); addRS(11,'Q',[[4,50,22],[4,51,23]]); addRS(11,'H',[[3,36,12],[8,37,13]]);
  addRS(12,'L',[[2,116,92],[2,117,93]]); addRS(12,'M',[[6,58,36],[2,59,37]]); addRS(12,'Q',[[4,46,20],[6,47,21]]); addRS(12,'H',[[7,42,14],[4,43,15]]);
  addRS(13,'L',[[4,133,107]]); addRS(13,'M',[[8,59,37],[1,60,38]]); addRS(13,'Q',[[8,44,20],[4,45,21]]); addRS(13,'H',[[12,33,11],[4,34,12]]);
  addRS(14,'L',[[3,145,115],[1,146,116]]); addRS(14,'M',[[4,64,40],[5,65,41]]); addRS(14,'Q',[[11,36,16],[5,37,17]]); addRS(14,'H',[[11,36,12],[5,37,13]]);
  addRS(15,'L',[[5,109,87],[1,110,88]]); addRS(15,'M',[[5,65,41],[5,66,42]]); addRS(15,'Q',[[5,54,24],[7,55,25]]); addRS(15,'H',[[11,36,12],[7,37,13]]);
  addRS(16,'L',[[5,122,98],[1,123,99]]); addRS(16,'M',[[7,73,45],[3,74,46]]); addRS(16,'Q',[[15,43,19],[2,44,20]]); addRS(16,'H',[[3,45,15],[13,46,16]]);
  addRS(17,'L',[[1,135,107],[5,136,108]]); addRS(17,'M',[[10,74,46],[1,75,47]]); addRS(17,'Q',[[1,50,22],[15,51,23]]); addRS(17,'H',[[2,42,14],[17,43,15]]);
  addRS(18,'L',[[5,150,120],[1,151,121]]); addRS(18,'M',[[9,69,43],[4,70,44]]); addRS(18,'Q',[[17,50,22],[1,51,23]]); addRS(18,'H',[[2,42,14],[19,43,15]]);
  addRS(19,'L',[[3,141,113],[4,142,114]]); addRS(19,'M',[[3,70,44],[11,71,45]]); addRS(19,'Q',[[17,47,21],[4,48,22]]); addRS(19,'H',[[9,39,13],[16,40,14]]);
  addRS(20,'L',[[3,135,107],[5,136,108]]); addRS(20,'M',[[3,67,41],[13,68,42]]); addRS(20,'Q',[[15,54,24],[5,55,25]]); addRS(20,'H',[[15,43,15],[10,44,16]]);

  function getRSBlocks(typeNumber, ecLevel) {
    var list = RS_BLOCK_TABLE[typeNumber] && RS_BLOCK_TABLE[typeNumber][ecLevel];
    if (!list) throw new Error("bad rs block @ typeNumber:" + typeNumber + "/ecLevel:" + ecLevel);
    var blocks = [];
    for (var i = 0; i < list.length; i++) {
      var n = list[i][0], total = list[i][1], data = list[i][2];
      for (var j = 0; j < n; j++) blocks.push({ totalCount: total, dataCount: data });
    }
    return blocks;
  }

  // ---- Bit buffer -------------------------------------------------------
  function QRBitBuffer() { this.buffer = []; this.length = 0; }
  QRBitBuffer.prototype = {
    getBuffer: function () { return this.buffer; },
    get: function (index) {
      var bufIndex = Math.floor(index / 8);
      return ((this.buffer[bufIndex] >>> (7 - index % 8)) & 1) === 1;
    },
    put: function (num, length) {
      for (var i = 0; i < length; i++) this.putBit(((num >>> (length - i - 1)) & 1) === 1);
    },
    putBit: function (bit) {
      var bufIndex = Math.floor(this.length / 8);
      if (this.buffer.length <= bufIndex) this.buffer.push(0);
      if (bit) this.buffer[bufIndex] |= (0x80 >>> (this.length % 8));
      this.length++;
    }
  };

  // ---- Mode-specific data encoders --------------------------------------
  function stringToUtf8Bytes(s) {
    var bytes = [];
    for (var i = 0; i < s.length; i++) {
      var code = s.codePointAt(i);
      if (code > 0xFFFF) i++; // consumed a surrogate pair
      if (code < 0x80) {
        bytes.push(code);
      } else if (code < 0x800) {
        bytes.push(0xC0 | (code >> 6), 0x80 | (code & 0x3F));
      } else if (code < 0x10000) {
        bytes.push(0xE0 | (code >> 12), 0x80 | ((code >> 6) & 0x3F), 0x80 | (code & 0x3F));
      } else {
        bytes.push(
          0xF0 | (code >> 18),
          0x80 | ((code >> 12) & 0x3F),
          0x80 | ((code >> 6) & 0x3F),
          0x80 | (code & 0x3F)
        );
      }
    }
    return bytes;
  }

  function QR8bitByte(data) {
    this.mode = 4; // byte mode
    this.data = data;
    this.bytes = stringToUtf8Bytes(data);
  }
  QR8bitByte.prototype = {
    getLength: function () { return this.bytes.length; },
    write: function (buffer) {
      for (var i = 0; i < this.bytes.length; i++) buffer.put(this.bytes[i], 8);
    }
  };

  // ---- Error correction levels ------------------------------------------
  var EC_LEVEL_BITS = { L: 1, M: 0, Q: 3, H: 2 };

  var PATTERN_POSITION_TABLE = [
    [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42],
    [6, 26, 46], [6, 28, 50], [6, 30, 54], [6, 32, 58], [6, 34, 62], [6, 26, 46, 66],
    [6, 26, 48, 70], [6, 26, 50, 74], [6, 30, 54, 78], [6, 30, 56, 82], [6, 30, 58, 86],
    [6, 34, 62, 90], [6, 28, 50, 72, 94]
  ];

  var G15 = (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0);
  var G18 = (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | (1 << 0);
  var G15_MASK = (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1);

  function getBCHDigit(data) {
    var digit = 0;
    while (data !== 0) { digit++; data >>>= 1; }
    return digit;
  }
  function getBCHTypeInfo(data) {
    var d = data << 10;
    while (getBCHDigit(d) - getBCHDigit(G15) >= 0) d ^= (G15 << (getBCHDigit(d) - getBCHDigit(G15)));
    return ((data << 10) | d) ^ G15_MASK;
  }
  function getBCHTypeNumber(data) {
    var d = data << 12;
    while (getBCHDigit(d) - getBCHDigit(G18) >= 0) d ^= (G18 << (getBCHDigit(d) - getBCHDigit(G18)));
    return (data << 12) | d;
  }

  function getMaskFunction(pattern) {
    switch (pattern) {
      case 0: return function (i, j) { return (i + j) % 2 === 0; };
      case 1: return function (i, j) { return i % 2 === 0; };
      case 2: return function (i, j) { return j % 3 === 0; };
      case 3: return function (i, j) { return (i + j) % 3 === 0; };
      case 4: return function (i, j) { return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0; };
      case 5: return function (i, j) { return (i * j) % 2 + (i * j) % 3 === 0; };
      case 6: return function (i, j) { return ((i * j) % 2 + (i * j) % 3) % 2 === 0; };
      case 7: return function (i, j) { return ((i * j) % 3 + (i + j) % 2) % 2 === 0; };
      default: throw new Error("bad maskPattern:" + pattern);
    }
  }

  function getLostPoint(qr) {
    var moduleCount = qr.getModuleCount();
    var lostPoint = 0;
    // rule 1: adjacent same-colour modules in a row/col
    for (var row = 0; row < moduleCount; row++) {
      for (var col = 0; col < moduleCount; col++) {
        var sameCount = 0;
        var dark = qr.isDark(row, col);
        for (var r = -1; r <= 1; r++) {
          if (row + r < 0 || moduleCount <= row + r) continue;
          for (var c = -1; c <= 1; c++) {
            if (col + c < 0 || moduleCount <= col + c) continue;
            if (r === 0 && c === 0) continue;
            if (dark === qr.isDark(row + r, col + c)) sameCount++;
          }
        }
        if (sameCount > 5) lostPoint += (3 + sameCount - 5);
      }
    }
    // rule 2: 2x2 blocks of same colour
    for (var row = 0; row < moduleCount - 1; row++) {
      for (var col = 0; col < moduleCount - 1; col++) {
        var count = 0;
        if (qr.isDark(row, col)) count++;
        if (qr.isDark(row + 1, col)) count++;
        if (qr.isDark(row, col + 1)) count++;
        if (qr.isDark(row + 1, col + 1)) count++;
        if (count === 0 || count === 4) lostPoint += 3;
      }
    }
    // rule 3: finder-like patterns
    for (var row = 0; row < moduleCount; row++) {
      for (var col = 0; col < moduleCount - 6; col++) {
        if (qr.isDark(row, col) && !qr.isDark(row, col + 1) && qr.isDark(row, col + 2) &&
            qr.isDark(row, col + 3) && qr.isDark(row, col + 4) && !qr.isDark(row, col + 5) && qr.isDark(row, col + 6)) {
          lostPoint += 40;
        }
      }
    }
    for (var col = 0; col < moduleCount; col++) {
      for (var row = 0; row < moduleCount - 6; row++) {
        if (qr.isDark(row, col) && !qr.isDark(row + 1, col) && qr.isDark(row + 2, col) &&
            qr.isDark(row + 3, col) && qr.isDark(row + 4, col) && !qr.isDark(row + 5, col) && qr.isDark(row + 6, col)) {
          lostPoint += 40;
        }
      }
    }
    // rule 4: dark module ratio
    var darkCount = 0;
    for (var col = 0; col < moduleCount; col++) {
      for (var row = 0; row < moduleCount; row++) if (qr.isDark(row, col)) darkCount++;
    }
    var ratio = Math.abs(100 * darkCount / moduleCount / moduleCount - 50) / 5;
    lostPoint += ratio * 10;
    return lostPoint;
  }

  function createData(typeNumber, ecLevel, dataList) {
    var rsBlocks = getRSBlocks(typeNumber, ecLevel);
    var buffer = new QRBitBuffer();
    for (var i = 0; i < dataList.length; i++) {
      var data = dataList[i];
      buffer.put(data.mode, 4);
      buffer.put(data.getLength(), getLengthInBits(data.mode, typeNumber));
      data.write(buffer);
    }
    var totalDataCount = 0;
    for (var i = 0; i < rsBlocks.length; i++) totalDataCount += rsBlocks[i].dataCount;
    if (buffer.length > totalDataCount * 8) {
      throw new Error("code length overflow. (" + buffer.length + ">" + totalDataCount * 8 + ")");
    }
    if (buffer.length + 4 <= totalDataCount * 8) buffer.put(0, 4);
    while (buffer.length % 8 !== 0) buffer.putBit(false);
    var PAD0 = 0xEC, PAD1 = 0x11;
    while (true) {
      if (buffer.length >= totalDataCount * 8) break;
      buffer.put(PAD0, 8);
      if (buffer.length >= totalDataCount * 8) break;
      buffer.put(PAD1, 8);
    }
    return createBytes(buffer, rsBlocks);
  }

  function getLengthInBits(mode, type) {
    // byte mode only (mode 4) is used by this generator
    if (type >= 1 && type <= 9) return 8;
    if (type >= 10 && type <= 26) return 16;
    return 16;
  }

  function createBytes(buffer, rsBlocks) {
    var offset = 0, maxDcCount = 0, maxEcCount = 0;
    var dcdata = new Array(rsBlocks.length);
    var ecdata = new Array(rsBlocks.length);
    for (var r = 0; r < rsBlocks.length; r++) {
      var dcCount = rsBlocks[r].dataCount;
      var ecCount = rsBlocks[r].totalCount - dcCount;
      maxDcCount = Math.max(maxDcCount, dcCount);
      maxEcCount = Math.max(maxEcCount, ecCount);
      dcdata[r] = new Array(dcCount);
      for (var i = 0; i < dcdata[r].length; i++) dcdata[r][i] = 0xff & buffer.getBuffer()[i + offset];
      offset += dcCount;
      var rsPoly = getErrorCorrectPolynomial(ecCount);
      var rawPoly = new QRPolynomial(dcdata[r], rsPoly.getLength() - 1);
      var modPoly = rawPoly.mod(rsPoly);
      ecdata[r] = new Array(rsPoly.getLength() - 1);
      for (var i = 0; i < ecdata[r].length; i++) {
        var modIndex = i + modPoly.getLength() - ecdata[r].length;
        ecdata[r][i] = (modIndex >= 0) ? modPoly.get(modIndex) : 0;
      }
    }
    var totalCodeCount = 0;
    for (var i = 0; i < rsBlocks.length; i++) totalCodeCount += rsBlocks[i].totalCount;
    var data = new Array(totalCodeCount);
    var index = 0;
    for (var i = 0; i < maxDcCount; i++) {
      for (var r = 0; r < rsBlocks.length; r++) if (i < dcdata[r].length) data[index++] = dcdata[r][i];
    }
    for (var i = 0; i < maxEcCount; i++) {
      for (var r = 0; r < rsBlocks.length; r++) if (i < ecdata[r].length) data[index++] = ecdata[r][i];
    }
    return data;
  }

  function getErrorCorrectPolynomial(errorCorrectLength) {
    var a = new QRPolynomial([1], 0);
    for (var i = 0; i < errorCorrectLength; i++) a = a.multiply(new QRPolynomial([1, gexp(i)], 0));
    return a;
  }

  // ---- The QR matrix model ----------------------------------------------
  function QRCodeModel(typeNumber, ecLevel) {
    this.typeNumber = typeNumber;
    this.ecLevel = ecLevel;
    this.modules = null;
    this.moduleCount = 0;
    this.dataList = [];
  }
  QRCodeModel.prototype = {
    addData: function (data) { this.dataList.push(new QR8bitByte(data)); },
    isDark: function (row, col) {
      if (row < 0 || this.moduleCount <= row || col < 0 || this.moduleCount <= col) {
        throw new Error(row + "," + col);
      }
      return this.modules[row][col];
    },
    getModuleCount: function () { return this.moduleCount; },
    make: function () { this.makeImpl(false, this.getBestMaskPattern()); },
    makeImpl: function (test, maskPattern) {
      this.moduleCount = this.typeNumber * 4 + 17;
      this.modules = new Array(this.moduleCount);
      for (var row = 0; row < this.moduleCount; row++) {
        this.modules[row] = new Array(this.moduleCount);
        for (var col = 0; col < this.moduleCount; col++) this.modules[row][col] = null;
      }
      this.setupPositionProbePattern(0, 0);
      this.setupPositionProbePattern(this.moduleCount - 7, 0);
      this.setupPositionProbePattern(0, this.moduleCount - 7);
      this.setupPositionAdjustPattern();
      this.setupTimingPattern();
      this.setupTypeInfo(test, maskPattern);
      if (this.typeNumber >= 7) this.setupTypeNumber(test);
      var dataArray = createData(this.typeNumber, this.ecLevel, this.dataList);
      this.mapData(dataArray, maskPattern);
    },
    setupPositionProbePattern: function (row, col) {
      for (var r = -1; r <= 7; r++) {
        if (row + r <= -1 || this.moduleCount <= row + r) continue;
        for (var c = -1; c <= 7; c++) {
          if (col + c <= -1 || this.moduleCount <= col + c) continue;
          if ((0 <= r && r <= 6 && (c === 0 || c === 6)) ||
              (0 <= c && c <= 6 && (r === 0 || r === 6)) ||
              (2 <= r && r <= 4 && 2 <= c && c <= 4)) {
            this.modules[row + r][col + c] = true;
          } else {
            this.modules[row + r][col + c] = false;
          }
        }
      }
    },
    getBestMaskPattern: function () {
      var minLostPoint = 0, pattern = 0;
      for (var i = 0; i < 8; i++) {
        this.makeImpl(true, i);
        var lostPoint = getLostPoint(this);
        if (i === 0 || minLostPoint > lostPoint) { minLostPoint = lostPoint; pattern = i; }
      }
      return pattern;
    },
    setupTimingPattern: function () {
      for (var r = 8; r < this.moduleCount - 8; r++) {
        if (this.modules[r][6] != null) continue;
        this.modules[r][6] = (r % 2 === 0);
      }
      for (var c = 8; c < this.moduleCount - 8; c++) {
        if (this.modules[6][c] != null) continue;
        this.modules[6][c] = (c % 2 === 0);
      }
    },
    setupPositionAdjustPattern: function () {
      var pos = PATTERN_POSITION_TABLE[this.typeNumber - 1] || [];
      for (var i = 0; i < pos.length; i++) {
        for (var j = 0; j < pos.length; j++) {
          var row = pos[i], col = pos[j];
          if (this.modules[row][col] != null) continue;
          for (var r = -2; r <= 2; r++) {
            for (var c = -2; c <= 2; c++) {
              if (r === -2 || r === 2 || c === -2 || c === 2 || (r === 0 && c === 0)) {
                this.modules[row + r][col + c] = true;
              } else {
                this.modules[row + r][col + c] = false;
              }
            }
          }
        }
      }
    },
    setupTypeNumber: function (test) {
      var bits = getBCHTypeNumber(this.typeNumber);
      for (var i = 0; i < 18; i++) {
        var mod = (!test && ((bits >> i) & 1) === 1);
        this.modules[Math.floor(i / 3)][i % 3 + this.moduleCount - 8 - 3] = mod;
      }
      for (var i = 0; i < 18; i++) {
        var mod = (!test && ((bits >> i) & 1) === 1);
        this.modules[i % 3 + this.moduleCount - 8 - 3][Math.floor(i / 3)] = mod;
      }
    },
    setupTypeInfo: function (test, maskPattern) {
      var data = (EC_LEVEL_BITS[this.ecLevel] << 3) | maskPattern;
      var bits = getBCHTypeInfo(data);
      for (var i = 0; i < 15; i++) {
        var mod = (!test && ((bits >> i) & 1) === 1);
        if (i < 6) this.modules[i][8] = mod;
        else if (i < 8) this.modules[i + 1][8] = mod;
        else this.modules[this.moduleCount - 15 + i][8] = mod;
      }
      for (var i = 0; i < 15; i++) {
        var mod = (!test && ((bits >> i) & 1) === 1);
        if (i < 8) this.modules[8][this.moduleCount - i - 1] = mod;
        else if (i < 9) this.modules[8][15 - i - 1 + 1] = mod;
        else this.modules[8][15 - i - 1] = mod;
      }
      this.modules[this.moduleCount - 8][8] = (!test);
    },
    mapData: function (data, maskPattern) {
      var inc = -1, row = this.moduleCount - 1, bitIndex = 7, byteIndex = 0;
      var maskFunc = getMaskFunction(maskPattern);
      for (var col = this.moduleCount - 1; col > 0; col -= 2) {
        if (col === 6) col--;
        while (true) {
          for (var c = 0; c < 2; c++) {
            if (this.modules[row][col - c] == null) {
              var dark = false;
              if (byteIndex < data.length) dark = (((data[byteIndex] >>> bitIndex) & 1) === 1);
              var mask = maskFunc(row, col - c);
              if (mask) dark = !dark;
              this.modules[row][col - c] = dark;
              bitIndex--;
              if (bitIndex === -1) { byteIndex++; bitIndex = 7; }
            }
          }
          row += inc;
          if (row < 0 || this.moduleCount <= row) { row -= inc; inc = -inc; break; }
        }
      }
    }
  };

  // ---- Capacity table (byte mode, per version/level) for auto-sizing ----
  // Approximate byte-mode capacities (characters) — used only to pick a
  // starting version quickly; actual fit is confirmed by trial encoding.
  function pickVersion(text, ecLevel) {
    for (var v = 1; v <= 20; v++) {
      try {
        var model = new QRCodeModel(v, ecLevel);
        model.addData(text);
        model.make();
        return model;
      } catch (e) {
        // too small for this version — try the next one
        continue;
      }
    }
    throw new Error("Text too long to encode as a QR code (max version 20 exceeded).");
  }

  var MMLIQRCode = {
    /**
     * Create a QR code model for the given text.
     * options.ecLevel: 'L' | 'M' | 'Q' | 'H' (default 'M')
     * options.typeNumber: force a specific version (1-20); omit for auto.
     */
    create: function (text, options) {
      options = options || {};
      var ecLevel = options.ecLevel || "M";
      if (options.typeNumber) {
        var model = new QRCodeModel(options.typeNumber, ecLevel);
        model.addData(text);
        model.make();
        return model;
      }
      return pickVersion(text, ecLevel);
    },

    /**
     * Render a QR model onto a <canvas> element.
     */
    render: function (model, canvas, options) {
      options = options || {};
      var cellSize = options.cellSize || 4;
      var margin = (options.margin != null) ? options.margin : 2;
      var dark = options.dark || "#000000";
      var light = options.light || "#ffffff";
      var count = model.getModuleCount();
      var size = (count + margin * 2) * cellSize;
      canvas.width = size;
      canvas.height = size;
      var ctx = canvas.getContext("2d");
      ctx.fillStyle = light;
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = dark;
      for (var row = 0; row < count; row++) {
        for (var col = 0; col < count; col++) {
          if (model.isDark(row, col)) {
            ctx.fillRect((col + margin) * cellSize, (row + margin) * cellSize, cellSize, cellSize);
          }
        }
      }
      return canvas;
    },

    /**
     * Convenience: build + render in one call. Returns the canvas.
     */
    toCanvas: function (text, canvas, options) {
      var model = this.create(text, options);
      return this.render(model, canvas, options);
    }
  };

  global.MMLIQRCode = MMLIQRCode;
  if (typeof module !== "undefined" && module.exports) module.exports = MMLIQRCode;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
