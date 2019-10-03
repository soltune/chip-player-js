downloaded from: http://www.vesta.dti.ne.jp/~tsato/soft_s98v3.html
------------------------------------------------------------------

m_s98.kpi S98V3対応版

これは?
  KbMediaPlayerのS98その他諸々プラグインをS98V3に対応させた物です。
  元々S98V3はm_s98が内部で利用していたS98V2を拡張した物です。

this is?
?? S98 of KbMediaPlayer and others Various plug-ins correspond to S98V3.
?? Originally S98V3 is an extension of S98V2 which m_s98 used internally.
  
  
ライセンス
  オリジナルに従います。

license
?? I will follow the original.

既知の不具合

 *タグ付きS98V3ファイルはKBM本体でうまく再生できない。
  KBM本体がS98V1と思いこんで情報取得に失敗する様です。
  回避策として一旦解凍して演奏してください。
  正式対応はKBM本体が対処しないと無理です。(本体の更新が最近無いので望み薄ですけど)
  
Known bug

? * The tagged S98V3 file can not be played well on the KBM itself.
?? It seems that KBM main body is S98V1 and fails to acquire information.
?? Please unzip once and play as a workaround.
?? It is impossible for KBM main body to deal with formal correspondence. (It is thin as you are not updating the main body so recently)
  
 *VGZのロード遅い
  gz解凍->s98変換->再生の3段階を踏んでロードするのでnativeプレイヤーより
  演奏開始が遅いです。
  KBM本体が別途gz解凍->タグ読み込みを実行するのでさらに遅くなる模様。(未検証)

* Loading VGZ slow
?? From the native player to load it by following three steps of decompressing gz -> s 98 conversion -> playback
?? The performance start is late.
?? It seems that the KBM itself will be delayed further since gz decompression -> tag reading is executed separately. (Unverified)
  
前回からの変更点

 *S98&VGM:再生デバイスの周波数指定をオートor44100KHz以外に指定した場合、
          OPLLの再生速度がおかしい不具合を修正(オリジナルからの潜在バグ)
 *S98:OPL3の再生で落ちる不具合を修正。

Changes since last time

? * S98 & VGM: When specifying the frequency specification of the playback device to other than Auto or 44100 KHz,
?????????? Fixed wrong bug in OPLL's playback speed (potential bug from original)
? * S98: Fixed a bug that dropped on OPL3 playback.


オリジナルからの変更点

 *S98:S98V3に対応
 *VGM:GameGearのパンを修正しました。
 *VGM:OPN2-PCMの不具合修正しました。
 *VGM:v1.50仕様の追加コマンドに対応。
 *X1F:PSGの再生周波数を修正しました。
 *zlibを更新しました。
  zlib 1.2.3 (c) 1995-2005 Jean-loup Gailly and Mark Adler

Changes from the original

? * S98: Corresponds to S98V3
? * VGM: We fixed bread of GameGear.
? * VGM: A bug in OPN2 - PCM was fixed.
? * VGM: Corresponds to additional command of v1.50 specification.
? * X1F: PSG playback frequency was corrected.
? * Updated zlib.
?? zlib 1.2.3 (c) 1995-2005 Jean-loup Gailly and Mark Adler
