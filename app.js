(() => {
  const CAT = [
    { name: '좋음', max: 28, color: '#1E88E5' },
    { name: '보통', max: 80, color: '#43A047' },
    { name: '나쁨', max: 146, color: '#F57C00' },
    { name: '매우나쁨', max: 1000, color: '#D32F2F' }
  ];

const AIRKOREA_KEY = window.env?.AIRKOREA_KEY || 'I2wDgBTJutEeubWmNzwVS1jlGSGPvjidKMb5DwhKkjM2MMUst8KGPB2D03mQv8GHu%2BRc8%2BySKeHrYO6qaS19Sg%3D%3D';
  const KAKAO_KEY = window.env?.KAKAO_KEY || 'be29697319e13590895593f5f5508348';
  const AIRKOREA_API = `https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty?serviceKey=${AIRKOREA_KEY}&returnType=json&numOfRows=1&pageNo=1&stationName={station}&dataTerm=DAILY&ver=1.3`;
  const NEARBY_API = `https://apis.data.go.kr/B552584/MsrstnInfoInqireSvc/getNearbyMsrstnList?serviceKey=${AIRKOREA_KEY}&returnType=json&tmX={tmX}&tmY={tmY}`;
  const KAKAO_ADDRESS_API = `https://dapi.kakao.com/v2/local/search/address.json`;
  const KAKAO_COORD_API = `https://dapi.kakao.com/v2/local/geo/coord2address.json`;

  function getStatus(v) {
    return CAT.find(c => v <= c.max) || CAT[CAT.length - 1];
  }

const createGauge = (canvasId, value) => {
    return new Chart(document.getElementById(canvasId), {
      type: 'doughnut',
      data: {
        datasets: [{
          data: [value, 150 - value],
          backgroundColor: [getStatus(value).color, '#eee'],
          borderWidth: 0
        }]
      },
      options: {
        circumference: 180,
        rotation: -90,
        cutout: '70%',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false }
        },
        animation: { animateRotate: true }
      }
    });
  };
  let gaugePM10Chart, gaugePM25Chart;

function drawGauge(pmType, value, station) {
    const canvasId = pmType === 'PM10' ? 'gaugePM10' : 'gaugePM25';
    const statusEl = document.getElementById(`status${pmType}`);
    const stationEl = document.getElementById(`station${pmType}`);
    const status = getStatus(value);

// 기존 차트 제거
    if (pmType === 'PM10' && gaugePM10Chart) gaugePM10Chart.destroy();
    if (pmType === 'PM25' && gaugePM25Chart) gaugePM25Chart.destroy();

    // 새 차트 생성
    const chart = createGauge(canvasId, value);
    if (pmType === 'PM10') gaugePM10Chart = chart;
    else gaugePM25Chart = chart;

    statusEl.textContent = status.name;
    statusEl.style.color = status.color;
    stationEl.textContent = `측정소: ${station}`;
  }

async function fetchAirData(station) {
    try {
      const url = AIRKOREA_API.replace('{station}', encodeURIComponent(station));
      console.log('AirKorea URL:', url);
      const res = await fetch(url);
      console.log('AirKorea 응답 상태:', res.status);
      if (!res.ok) {
        const text = await res.text();
        console.log('AirKorea 응답 텍스트:', text);  // HTML 오류 로그
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      console.log('AirKorea 데이터:', data);
      const item = data.response.body.items[0];
      return { pm10: parseFloat(item.pm10Value) || 0, pm25: parseFloat(item.pm25Value) || 0, station };
    } catch (e) {
      console.error('AirKorea API 오류:', e);
      return { pm10: 0, pm25: 0, station };
    }
  }

 async function getNearestStation(lat, lon) {
    try {
      const tmUrl = `${KAKAO_COORD_API}?x=${lon}&y=${lat}`;
      console.log('Kakao TM URL:', tmUrl);
      const tmRes = await fetch(tmUrl, {
        headers: { Authorization: `KakaoAK ${KAKAO_KEY}` }
      });
      console.log('Kakao TM 응답 상태:', tmRes.status);
      if (!tmRes.ok) {
        const text = await tmRes.text();
        console.log('Kakao TM 응답 텍스트:', text);  // 오류 로그
        throw new Error(`Kakao HTTP ${tmRes.status}`);
      }
      const tmData = await tmRes.json();
      console.log('Kakao TM 데이터:', tmData);
      const tmX = tmData.documents[0]?.address?.x || lon;
      const tmY = tmData.documents[0]?.address?.y || lat;
      console.log('TM X/Y:', tmX, tmY);

      const nearbyUrl = NEARBY_API.replace('{tmX}', tmX).replace('{tmY}', tmY);
      console.log('AirKorea Nearby URL:', nearbyUrl);
      const res = await fetch(nearbyUrl);
      console.log('AirKorea Nearby 응답 상태:', res.status);
      if (!res.ok) throw new Error(`AirKorea Nearby HTTP ${res.status}`);
      const data = await res.json();
      console.log('AirKorea Nearby 데이터:', data);
      return data.response.body.items[0]?.stationName || '서울 종로구';
    } catch (e) {
      console.error('측정소 조회 오류:', e);
      return '서울 종로구';
    }
  }

  async function updateAll(lat, lon) {
    console.log('위치:', lat, lon);
    const station = await getNearestStation(lat, lon);
    console.log('측정소:', station);
    const { pm10, pm25 } = await fetchAirData(station);
    console.log('PM10:', pm10, 'PM25:', pm25);
    drawGauge('PM10', pm10, station);
    drawGauge('PM25', pm25, station);
    updateRegion(lat, lon);
    updateDateTime();
  }

  const input = document.getElementById('place');
  const sug = document.getElementById('suggestions');
  input.addEventListener('input', async () => {
    if (!input.value) return sug.innerHTML = '';
    try {
      const q = encodeURIComponent(input.value);
      const res = await fetch(`${KAKAO_ADDRESS_API}?query=${q}`, {
        headers: { Authorization: `KakaoAK ${KAKAO_KEY}` }
      });
      console.log('Kakao 검색 응답 상태:', res.status);
      if (!res.ok) throw new Error(`Kakao HTTP ${res.status}`);
      const { documents } = await res.json();
      console.log('Kakao 검색 데이터:', documents);
      sug.innerHTML = '';
      documents.slice(0, 5).forEach(d => {
        const li = document.createElement('li');
        li.textContent = d.address_name;
        li.onclick = () => {
          input.value = d.address_name;
          sug.innerHTML = '';
          updateAll(d.y, d.x);
        };
        sug.appendChild(li);
      });
    } catch (e) {
      console.error('Kakao 검색 오류:', e);
    }
  });

  document.getElementById('searchBtn').onclick = () => {
    if (input.value) {
      const li = sug.querySelector('li');
      if (li) li.click();
    }
  };

  document.getElementById('adminBtn').onclick = () => {
    const pw = prompt('비밀번호');
    if (pw === 'leesoul0407!') location.href = '/front/admin.html';
  };

  navigator.geolocation.getCurrentPosition(
    p => updateAll(p.coords.latitude, p.coords.longitude),
    () => {
      console.error('위치 수집 실패');
      alert('위치 수집 실패');
    }
  );

function updateDateTime() {
    document.getElementById('time').textContent = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  }
  setInterval(updateDateTime, 60000);

  async function updateRegion(lat, lon) {
    try {
      const res = await fetch(`${KAKAO_COORD_API}?x=${lon}&y=${lat}`, {
        headers: { Authorization: `KakaoAK ${KAKAO_KEY}` }
      });
      console.log('Kakao 지역 응답 상태:', res.status);
      if (!res.ok) throw new Error(`Kakao HTTP ${res.status}`);
      const { documents } = await res.json();
      console.log('Kakao 지역 데이터:', documents);
      document.getElementById('region').textContent = documents[0]?.address?.address_name || '--';
    } catch (e) {
      console.error('지역 업데이트 오류:', e);
      document.getElementById('region').textContent = '--';
    }
  }
})();