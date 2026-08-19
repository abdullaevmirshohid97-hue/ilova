import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { phoneToEmail, supabase } from '../lib/supabase';
import { useLanguage } from '../lib/i18n';

function ForgotPasswordModal({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage();
  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
      <View style={fp.overlay}>
        <View style={fp.card}>
          <Text style={fp.icon}>🔑</Text>
          <Text style={fp.title}>{t('forgotTitle')}</Text>
          <Text style={fp.body}>{t('forgotBody')}</Text>
          <TouchableOpacity style={fp.closeBtn} onPress={onClose}>
            <Text style={fp.closeText}>{t('forgotClose')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default function LoginScreen() {
  const { t } = useLanguage();
  const [phone, setPhone] = useState('+998');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForgot, setShowForgot] = useState(false);

  async function handleLogin() {
    setError(null);
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({
      email: phoneToEmail(phone),
      password,
    });
    setLoading(false);
    if (!err) return;

    // Avval HAR QANDAY xato "telefon yoki parol noto'g'ri" deb ko'rsatilardi —
    // shu sababli serverga umuman ulana olmaganda ham foydalanuvchi parolini
    // qayta-qayta terib, sababni topa olmasdi. Endi ajratamiz.
    const tarmoq =
      err.status === 0 ||
      err.status === undefined ||
      /fetch|network|failed to|timeout/i.test(err.message ?? '');
    const notogriParol = err.status === 400 || /invalid|credential/i.test(err.message ?? '');

    if (notogriParol) setError(t('loginError'));
    else if (tarmoq) setError(t('loginNetworkError'));
    else setError(`${t('loginServerError')} (${err.status ?? '?'}): ${err.message}`);
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.logo}>YUKCHIBOLLA</Text>
        <Text style={styles.subtitle}>{t('loginSubtitle')}</Text>

        <Text style={styles.label}>{t('loginPhoneLabel')}</Text>
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          autoCapitalize="none"
          placeholder="+998 90 123 45 67"
          placeholderTextColor="#B9BDCC"
        />

        <Text style={styles.label}>{t('loginPasswordLabel')}</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder={t('loginPasswordPlaceholder')}
          placeholderTextColor="#B9BDCC"
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading || password.length === 0}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>{t('loginButton')}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setShowForgot(true)}>
          <Text style={styles.forgotLink}>{t('forgotLink')}</Text>
        </TouchableOpacity>

        <Text style={styles.hint}>{t('loginHint')}</Text>

        {Platform.OS === 'web' && (
          <TouchableOpacity
            style={styles.apkBtn}
            onPress={() => {
              window.location.href = '/yukchibolla.apk';
            }}
          >
            <Text style={styles.apkBtnText}>📱 {t('downloadApk')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {showForgot && <ForgotPasswordModal onClose={() => setShowForgot(false)} />}
    </KeyboardAvoidingView>
  );
}

const fp = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(20,21,26,0.5)', justifyContent: 'center', padding: 24 },
  card: {
    width: '100%',
    maxWidth: 380,
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
  },
  icon: { fontSize: 36 },
  title: { color: '#14151A', fontSize: 18, fontWeight: '800', marginTop: 8 },
  body: { color: '#3B3E48', fontSize: 14, textAlign: 'center', marginTop: 10, lineHeight: 20 },
  closeBtn: {
    backgroundColor: '#7000FF',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 32,
    marginTop: 18,
  },
  closeText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F3F7',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
  },
  logo: {
    color: '#7000FF',
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 2,
  },
  subtitle: {
    color: '#8E92A3',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 28,
  },
  label: {
    color: '#8E92A3',
    fontSize: 13,
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: '#F2F3F7',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E9EAF2',
    color: '#14151A',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  error: {
    color: '#f87171',
    marginTop: 12,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#7000FF',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  forgotLink: {
    color: '#7000FF',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 16,
  },
  hint: {
    color: '#B9BDCC',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 16,
  },
  apkBtn: {
    marginTop: 20,
    borderWidth: 1.5,
    borderColor: '#7000FF',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  apkBtnText: {
    color: '#7000FF',
    fontSize: 14,
    fontWeight: '700',
  },
});
