------------------------------------------------------------------------------
        FM Sound Generator with OPN/OPM interface
        Copyright (C) by cisc 1998, 2003.
------------------------------------------------------------------------------

【概要】
	C++ による FM/PSG 音源の実装です。
	
	AY8910, YM2203, YM2151, YM2608, YM2610 相当のインターフェースも
	実装してあります。

【Overview】
It is an implementation of FM / PSG sound source by C ++.
In case
Interfaces equivalent to AY 8910, YM 2203, YM 2151, YM 2608, and YM 2610

【使い方】
	(TODO:中身を書く)

【How to use】
(TODO: write the contents)
	
【注意】
	以前のバージョンから幾分手を加えました。インターフェースは
	いじっていないつもりですが、何かしらのバグが隠れているかもしれません。

	YM2610 は動作チェックすらしていません。

	線形補完モード(interpolation)は廃止されました。
	Init() の引数仕様は変わっていませんが、interpolation = true にしても
	動作は変わりません。

	OPNA::Init/SetRate で与えるチップクロックの値の仕様が
	以前の M88 に搭載されていたバージョンと異なっています．

【Caution】
I made some changes from the previous version. The interface is
I do not intend to fuse, but some bugs may be hiding.

YM 2610 does not even check the operation.

Linear interpolation mode (interpolation) has been deprecated.
The argument specification of Init () has not changed, but even if interpolation = true
The behavior does not change.

Specification of chip clock value given by OPNA :: Init / SetRate is
It is different from the version installed in the previous M88.

【著作権、免責規定】

	・本ソースコードは作者(cisc@retropc.net) が著作権を所有しています。
	
	・本ソースコードはあるがままに提供されるものであり，
	  暗黙及び明示的な保証を一切含みません．
	  
	・本ソースコードを利用したこと，利用しなかったこと，
	  利用できなかったことに関して生じたあるいは生じると予測される
	  損害について，作者は一切責任を負いません．
	  
	・本ソースコードは，以下の制限を満たす限り自由に改変・組み込み・
	  配布・利用することができます．
	  
	  1. 本ソフトの由来(作者, 著作権)を明記すること.
	  2. 配布する際にはフリーソフトとすること．
	  3. 改変したソースコードを配布する際は改変内容を明示すること.
	  4. ソースコードを配布する際にはこのテキストを一切改変せずに
	     そのまま添付すること．
	  
	・公開の際に作者への連絡を頂ければ幸いです．
	
	・商用ソフト(シェアウェア含む) に本ソースコードの一部，または
	  全部を組み込む際には，事前に作者の合意を得る必要があります．

	  
【Copyright, Disclaimer】

・ This source code is copyrighted by the author (cisc@retropc.net).
In case
・ This source code is provided as it is,
No implied or explicit warranty is included.
In case
・ I used this source code, did not use it,
It is expected to arise or to occur with respect to what was not available
The author is not responsible for any damage.
In case
・ This source code can be freely modified / incorporated as long as it satisfies the following restrictions
It can be distributed and used.
In case
1. Specify the origin (author, copyright) of this software.
2. To distribute it should be free software.
3. When distributing the modified source code, indicate the contents of modification.
4. When distributing the source code, without modifying this text at all
Attach as it is.
In case
・ I am pleased if you can contact the author when publishing.
In case
・ Part of this source code on commercial software (including shareware) or
When incorporating all, it is necessary to obtain agreement of the author beforehand.	  

【変更点】
008	030902	・出力サンプリングレートの設定を、チップ元来の合成サンプ
                  リングレートと異なる設定にするとエンベロープがおかしく
                  なる問題を修正。

007a	030608	・領域外アクセスがあったのを修正 (Thanks to ＰＩ．様)

007	030607	・再現性の向上
		・OPN: SSG-EG のサポート
		・線形補完の廃止
		・asm 版の廃止
		・マルチスレッドフリーになった？

006	010330	・再現性に関していくらか手直し(正弦波，出力タイミング等)

005	010317	・OPN: FM 音源の合成周波数が出力周波数よりも低いときに，
		  補完を使うと音痴になる/音がまともに出なくなる問題を修正.
		・FM: 補完を使わない時の精度を上げてみる．
		  問題が起きたら fmgeninl.h の FM_RATIOBITS を 8 に戻すと吉．

004a	010311	・OPM: ノイズをそこそこ聞けるレベル(？)まで修正.
		・OPNA/OPM: FM_USE_CALC2 廃止.
		・デグレ修正, なんのために cvs で管理しているんだか…(T-T
		  OPNB: ADPCMB ROM マスク作成ミス.
		  OPNB: ADPCMA ステータスフラグ関係の挙動修復.
		  OPM: LFO パラメータの初期化を忘れていたのを修正.

003	010124	・OPNA/OPM： 実際には補完前の値を出力していたバグを修正.

002	010123	・合成周波数が出力周波数より低いときでも補間が効くようにする.
		・OPN: 補間時にプリスケーラの設定を変更したときに音化けする
		  バグを修正.
		・OPNA/B: LFO が効かないバグを修正.

001 	000928	・初期バージョン

【change point】
008 030902 ・ Set the output sampling rate to the original synthesis sample of chip
?????????????????? If it is set differently from the ring rate, the envelope is amusing
?????????????????? Fixed the problem becoming.

007a 030608 ・ Corrected out of area access (Thanks to PI.)

007 030607 ・ Improve reproducibility
・ OPN: Support for SSG-EG
・ Elimination of linear interpolation
・ Abolition of asm version
・ Have you become multithread free?		

006 010330 ・ Some rework about reproducibility (sine wave, output timing etc.)

005 010317 OPN: When the synthesized frequency of the FM sound source is lower than the output frequency,
Fixed a problem that when you use completion, you get tone / the sound does not go out correctly.
・ FM: Try increasing accuracy when not using completion.
When problems occur, return FM_RATIOBITS in fmgeninl.h to 8.

004a 010311 ・ OPM: Fixed the level to which you can hear the noise so much (?).
・ OPNA / OPM: FM_USE_CALC 2 obsolete.
・ Degre corrected, what is managed by cvs for what ... (T - T
OPNB: ADPCMB ROM mask mistake.
OPNB: Behavior restoration related to ADPCMA status flag.
OPM: Fixed forgetting to initialize LFO parameters.

003 010124 ・ OPNA / OPM: Fixed a bug that actually output values ??before completion.

002 01012 ・ Make interpolation work even when the synthesized frequency is lower than the output frequency.
・ OPN: Sounds unnatural when prescaler setting is changed during interpolation
Fixed a bug.
・ OPNA / B: Fixed a bug that LFO does not work.

001 000928 ・ Initial version		

$Id: readme.txt,v 1.1 2003/06/07 08:25:20 cisc Exp $
