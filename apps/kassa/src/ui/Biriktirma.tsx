// =============================================================
//  BIRIKTIRMA QISMI — rasm va video qo'shish
//
//  Izohdan keyin turadi: dalil izohning davomi, alohida bo'lim
//  emas.
//
//  Fayllar TELEFONDA qoladi, serverga ketmaydi. Bu ekranda
//  yozib qo'yilgan — odam "boshqa telefonimda ko'rinmadi" deb
//  xato deb o'ylamasligi kerak.
//
//  Video 10 soniya bilan CHEKLANGAN va cheklov tanlagichning
//  o'zida: odam uzunini tanlay ham olmaydi, ya'ni "nega
//  kesildi" degan savol tug'ilmaydi.
// =============================================================

import { useState } from 'react';
import { Image, Modal, Pressable, Text, TouchableOpacity, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { O, useTema } from '../lib/tema';
import { tr, trn } from '../lib/til';
import { Ogoh } from '../lib/ogoh';
import { rasmTanla, videoTanla, VIDEO_SONIYA } from '../lib/biriktirma';

export function Biriktirma({
  rasm,
  video,
  rasmQoy,
  videoQoy,
}: {
  rasm: string | null;
  video: string | null;
  rasmQoy: (u: string | null) => void;
  videoQoy: (u: string | null) => void;
}) {
  const { C } = useTema();
  const [korish, setKorish] = useState<'rasm' | 'video' | null>(null);

  function manbaSora(nom: string, olish: (kamera: boolean) => Promise<string | null>, qoy: (u: string | null) => void) {
    Ogoh.alert(nom, tr('Qayerdan olamiz?'), [
      { text: tr('Galereya'), onPress: () => void olish(false).then((u) => u && qoy(u)) },
      { text: tr('Kamera'), onPress: () => void olish(true).then((u) => u && qoy(u)) },
    ]);
  }

  const tugma = {
    flex: 1,
    paddingVertical: 11,
    borderRadius: O.radiusKichik,
    borderWidth: 1,
    borderColor: C.chegara,
    backgroundColor: C.karta2,
    alignItems: 'center' as const,
  };

  return (
    <View style={{ marginTop: 12 }}>
      <Text style={{ color: C.matn2, fontSize: 13, fontWeight: '600', marginBottom: 6 }}>
        {tr('Dalil (ixtiyoriy)')}
      </Text>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TouchableOpacity
          style={tugma}
          onPress={() => (rasm ? setKorish('rasm') : manbaSora(tr('Rasm'), rasmTanla, rasmQoy))}
        >
          <Text style={{ color: rasm ? C.kirim : C.matn2, fontSize: 14, fontWeight: '600' }}>
            {rasm ? tr('Rasm ✓') : tr('+ Rasm')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={tugma}
          onPress={() => (video ? setKorish('video') : manbaSora(tr('Video'), videoTanla, videoQoy))}
        >
          <Text style={{ color: video ? C.kirim : C.matn2, fontSize: 14, fontWeight: '600' }}>
            {video ? tr('Video ✓') : tr('+ Video')}
          </Text>
        </TouchableOpacity>
      </View>

      {(rasm || video) && (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          {rasm && (
            <Nishoncha
              manba={rasm}
              video={false}
              bos={() => setKorish('rasm')}
              ochir={() => rasmQoy(null)}
            />
          )}
          {video && (
            <Nishoncha
              manba={video}
              video
              bos={() => setKorish('video')}
              ochir={() => videoQoy(null)}
            />
          )}
        </View>
      )}

      <Text style={{ color: C.xira, fontSize: 11, marginTop: 8, lineHeight: 16 }}>
        {trn('Faqat shu telefonda saqlanadi, serverga yuborilmaydi. Video — {n} soniyagacha.', VIDEO_SONIYA)}
      </Text>

      <Modal visible={korish !== null} transparent animationType="fade">
        <Pressable
          style={{ flex: 1, backgroundColor: '#000000E6', alignItems: 'center', justifyContent: 'center' }}
          onPress={() => setKorish(null)}
        >
          {korish === 'rasm' && rasm && (
            <Image source={{ uri: rasm }} style={{ width: '92%', height: '70%' }} resizeMode="contain" />
          )}
          {korish === 'video' && video && <VideoOyna manba={video} />}
          <Text style={{ color: '#FFFFFF', fontSize: 14, marginTop: 18 }}>{tr('Yopish')}</Text>
        </Pressable>
      </Modal>
    </View>
  );
}

function Nishoncha({
  manba,
  video,
  bos,
  ochir,
}: {
  manba: string;
  video: boolean;
  bos: () => void;
  ochir: () => void;
}) {
  const { C } = useTema();
  return (
    <View>
      <TouchableOpacity onPress={bos}>
        {video ? (
          // Video uchun kadr chiqarish alohida modul talab qiladi —
          // shunchaki belgi ko'rsatamiz, bosilganda ochiladi.
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: O.radiusKichik,
              backgroundColor: C.karta2,
              borderWidth: 1,
              borderColor: C.chegara,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: C.matn2, fontSize: 22 }}>▶</Text>
          </View>
        ) : (
          <Image
            source={{ uri: manba }}
            style={{ width: 64, height: 64, borderRadius: O.radiusKichik, backgroundColor: C.karta2 }}
          />
        )}
      </TouchableOpacity>

      <TouchableOpacity
        onPress={ochir}
        // Bosish maydoni belgidan KATTA: 12px belgini barmoq bilan
        // aniq bosib bo'lmaydi.
        hitSlop={10}
        style={{
          position: 'absolute',
          top: -6,
          right: -6,
          width: 22,
          height: 22,
          borderRadius: 11,
          backgroundColor: C.chiqim,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700', marginTop: -1 }}>×</Text>
      </TouchableOpacity>
    </View>
  );
}

function VideoOyna({ manba }: { manba: string }) {
  const pleyer = useVideoPlayer(manba, (p) => {
    p.loop = true;
    p.play();
  });
  return <VideoView style={{ width: '92%', height: '60%' }} player={pleyer} allowsFullscreen />;
}
