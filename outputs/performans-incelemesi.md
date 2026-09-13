# Neon Tank performans incelemesi

## Sonuç ve kanıt sınırı

Takılma şikâyetini yalnızca ping veya telefon markasıyla açıklamak mümkün değil. İncelenen 11abd7a sürümünde hem hareket sürekliliğini bozan mantık hataları hem de özellikle büyük dokunmatik ekranlarda gereksiz çizim yükü bulundu. Bu rapordaki sayısal sonuçlar yerel Windows bilgisayarındaki Chromium/Edge ve Node testlerinden gelir; fiziksel Android/iPad cihazlarından alınmış ölçümler değildir. Ücretsiz sunucunun darboğaz olduğu doğrulanmadı ve barındırma planı değiştirilmedi.

## Bulunan nedenler ve düzeltmeler

### İki parmağın birbirinin kontrolünü bozması

Eski geniş sürüş alanı tek bir boolean ile izleniyordu. Her pointerup olayı sürüşü bırakıyordu; ateş parmağını kaldırmak da tankı durduruyordu. Joystick üzerindeki React olayları ile pencerenin olayları aynı hareketi farklı merkezlerden tekrar hesaplıyordu. Kullanıcı bunu yön atlaması veya anlık durma olarak algılayabilir.

Sürüş tek pointerId ile izleniyor. Başlangıç noktası dokunulan yer; 8 piksel ölü bölge küçük titremeyi önlüyor. Başka parmağın kalkması sürüşe dokunmuyor. Menü ve hazır butonları sürüş başlatmıyor. Pencere odağı kaybolunca veya sekme gizlenince hareket sıfırlanıyor. Geniş sol sürüş alanı korunuyor.

### Çizimin sunucu verisini değiştirmesi

smoothState ilk paket ve tur değişiminde aldığı nesneyi doğrudan geri döndürüyordu. Çizim döngüsü kendi tankını bu nesnenin içine yazınca authoritative konumlar değişebiliyordu. Bir sonraki düzeltmenin başlangıç verisi güvenilir kalmıyordu. Artık çizim için oyuncu ve mermi kopyaları üretiliyor. Bu durum için kalıcı regresyon testi eklendi.

Eski tahmin her paket geldiğinde tankı yüzde 20 geçmiş sunucu konumuna çekiyor, sonra kare başına tekrar ilerletiyordu. Yeni görsel tahmin paket yaşı ve ölçülen ping üzerinden en fazla 100 ms ileri hedef oluşturuyor; duvarları ve diğer tankları denetleyerek hedefe zamana bağlı yaklaşıyor. Tur dışında ve 250 ms boyunca veri gelmediğinde tahmin duruyor. Bu yaklaşım sınırlı görsel tahmindir; komut geçmişini yeniden oynatan tam ağ uzlaştırması değildir. Çok yüksek gecikme hâlâ hissedilebilir.

### Paketlerin düzensiz aralığı ve mermi kimliği

Her gelişte yeniden başlayan 50 ms animasyon yerine son paketler sınırlı bir tamponda tutuluyor ve rakip görüntüsü yaklaşık 100 ms geriden örnekleniyor. Bu bilinçli görüntü gecikmesi normal paket aralığı değişimlerini karşılar; uzun kesintileri tamamen gizleyemez.

Mermiler dizi indeksiyle eşleştiriliyordu. Öndeki mermi yok olduğunda kalan mermi başka bir merminin eski konumundan çizilebiliyordu. Sunucu artık her mermiye benzersiz kimlik veriyor. Çizim kimlikle eşleşiyor; sekme sayısı değiştiğinde eski ve yeni konum arasında kestirme çizilmiyor. Her iki durum kalıcı testlerle doğrulandı.

### Mobil çizim yükü

Tank paletleri, kalkan, mermi, kıvılcım ve patlamalarda her karede shadowBlur çalışıyordu. Önceki tasarruf düzenlemeleri bu işlemleri kapatmıyordu. Mobil cihazda yüksek piksel yoğunluğu ve geniş ekran, yükü büyütüyordu. MDN, tekrarlı çizimleri önbelleğe almayı ve shadowBlur kullanımını azaltmayı önerir.[1]

Dokunmatik cihazlarda hareketli nesnelerin bulanık gölgeleri kaldırıldı; renkler, tank gövdeleri, duvarlar ve temel efektler korundu. Canvas bütçesi normalde yaklaşık 900 bin, tasarrufta 450 bin pikselle sınırlandı. CSS backdrop-filter dokunmatik kontrol düğmelerinde kapatıldı. Ekran genişliği 1000 pikseli aştığında yanlışlıkla yüksek çözünürlüğe geçme sorunu giderildi.

Tasarruf artık tek bir kötü saniye üzerine mod değiştirmiyor: iki ardışık iki saniyelik düşük FPS penceresi gerekiyor. Normal kaliteye dönüş için yaklaşık 20 saniye iyi performans gerekiyor. Canvas yalnızca gerçek boyutu değişirse yeniden oluşturuluyor. 120 Hz ekranda gereksiz 120 çizim yerine en fazla yaklaşık 60 çizim hedefleniyor; arka planda çizim yapılmıyor.

### React ve sunucu yükü

Her ağ paketi tüm React arayüzünü güncelliyordu. Konum paketleri artık doğrudan çizim referanslarına yazılıyor. React yalnızca tur, skor, hazır durumu, güç veya mermi adedi gibi arayüz değerleri değişince güncelleniyor. Hazır sınıfını değiştiren etki de her konum paketinde tetiklenmiyor.

Fizikte her yarım piksel adım için bütün duvarlar tekrar taranıyordu. Hareketin kapsadığı dikdörtgene girmeyen duvarlar hesap öncesinde eleniyor. Hassas çarpışma alt adımları korunuyor. Sunucu zamanlayıcısında geçen gerçek zaman biriktirilerek 60 Hz fizik adımları uygulanıyor; uzun duraksamalar için telafi üst sınırı 100 ms. Sürekli hareket paketleri tamponlanmadan gönderiliyor. Socket.IO belgeleri, çevrimdışı sıraya alınan olayların yeniden bağlanmada yığılma yaratabileceğini açıklar.[2] Kritik tur ve harita olayları güvenilir kalıyor. 250 ms yeni girdi gelmezse tank duruyor.

## Test sonuçları

| Test | Sonuç |
|---|---|
| 1024×600, DPR 2, dokunmatik, CPU 4× yavaşlatılmış tarayıcı | Eski/yeni dört oyunculu oda açıldı; JavaScript hatası yok |
| Canvas alanı | 1.652.892 → 645.729 piksel; yaklaşık %61 azalma |
| Altı saniyelik örnekte pozitif dinamik gölge ayarı | Eski 3.072; yeni 0 |
| Tarayıcı kare geri çağrıları | Her iki sürümde yaklaşık 60/s; bu test FPS artışı kanıtlamaz, yük azalmasını gösterir |
| Sürüş sırasında diğer parmağı bırakma | Hareket değeri 1 kaldı |
| Sürüş parmağını bırakma | Hareket değeri 0 oldu |
| 100 labirentte 10.000 fizik senaryosu | Tank ve mermi sonuçları eski algoritmayla aynı |
| 30.000 hareket hesabı mikro ölçümü | 255 ms → 62 ms; bu makinede yaklaşık 4,1× |
| Dört istemci bağlantı testi | Yaklaşık 21 paket/s; tekrar duvar paketi yok; benzersiz mermi kimlikleri doğrulandı |
| 120–180 ms yapay gidiş-dönüş gecikmesi | Dört oyuncu maça başladı; 1,5 saniyede 30 oynanış güncellemesi |
| Var olan fizik testleri ve yeni istemci regresyonları | 11 test geçti |

Mikro ölçüm bütün oyunun dört kat hızlı olduğu anlamına gelmez. Headless Chromium testi fiziksel cihaz GPU'sunu, sıcaklık kısıtlamasını veya gerçek mobil paket kaybını temsil etmez. Gecikme testi bağlantı akışını doğrular; gerçek telefondaki hissi ölçmez.

## Doğrulama ve izleme

Kalıcı kontroller: npm run build ve npm run test:logic. Yerel ayrıntılı karşılaştırma betikleri work/physics-check.mjs, work/network-check.mjs, work/latency-check.mjs ve work/performance-check.cjs altında tutulur. Eski istemci referansı work/baseline altında; bu geçici deney dosyaları üretime gönderilmez.

Yeni sürümün fiziksel cihaz doğrulamasında cihaz modeli, tarayıcı, FPS, ms ve takılmanın ateşle eşzamanlı olup olmadığı kaydedilmelidir. FPS düşük kalıyorsa çizim profili; FPS yüksekken kontrol gecikiyorsa ağ süresi ve sunucu iş yükü incelenmelidir. Bu veriler olmadan ücretli sunucuya geçmenin sorunu çözeceği söylenemez.

## Kaynaklar

1. MDN, Optimizing canvas: https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas — tekrarlı çizimlerin önbelleğe alınması, shadowBlur ve çizim maliyeti.
2. Socket.IO, Offline behavior: https://socket.io/docs/v4/client-offline-behavior/ — çevrimdışı tampon ve volatile gönderim.
3. Projenin 11abd7a sürümü: src/main.tsx (smoothState, acceptState, animate, geniş sürüş olayları), server.mjs (tick, snapshot, player-input), game-physics.mjs (moveCircle, advanceBullet). Bulgular kaynak kodu ve yukarıdaki yerel deneylere dayanır.
